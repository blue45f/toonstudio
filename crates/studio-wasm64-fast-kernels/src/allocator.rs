//! `wasm32` / `wasm64` 공용 `#![no_std]` 병합형 프리리스트 전역 할당기.
//!
//! `-Z build-std=core,alloc` 환경에서 외부 의존성 없이 `Vec` 및 `wasm_alloc`/`wasm_free`
//! 반복 호출의 메모리를 재사용하고 인접 해제 블록을 병합해 누수를 방지한다.

#![cfg(target_family = "wasm")]
#![allow(unsafe_code)]

use core::alloc::{GlobalAlloc, Layout};
use core::cell::UnsafeCell;
use core::mem;
use core::ptr;

const PAGE_SIZE: usize = 65_536;
const MIN_GROW_PAGES: usize = 4;
const MIN_ALIGN: usize = 16;

#[repr(C, align(16))]
struct FreeBlock {
    size: usize,
    next: *mut FreeBlock,
}

const HEADER_SIZE: usize = mem::size_of::<FreeBlock>();
const PTR_SIZE: usize = mem::size_of::<usize>();

#[inline]
fn align_up(value: usize, align: usize) -> Option<usize> {
    let mask = align.checked_sub(1)?;
    value.checked_add(mask).map(|v| v & !mask)
}

#[inline]
fn wasm_memory_grow(pages: usize) -> usize {
    #[cfg(target_arch = "wasm64")]
    {
        core::arch::wasm64::memory_grow::<0>(pages)
    }
    #[cfg(target_arch = "wasm32")]
    {
        core::arch::wasm32::memory_grow::<0>(pages)
    }
}

/// 단일 스레드 WebAssembly 선형 메모리 전용 프리리스트 할당기.
pub struct WasmFreeListAllocator {
    head: UnsafeCell<*mut FreeBlock>,
}

// SAFETY: `target_family = "wasm"` 비원자(+atomics 미사용) 빌드는 단일 스레드로만 실행된다.
unsafe impl Sync for WasmFreeListAllocator {}

impl WasmFreeListAllocator {
    pub const fn new() -> Self {
        Self {
            head: UnsafeCell::new(ptr::null_mut()),
        }
    }

    unsafe fn insert_and_coalesce(&self, block: *mut FreeBlock) {
        // SAFETY: 단일 스레드 WASM 선형 메모리에서 호출되며 `block`은 유효한 16바이트 정렬 헤더다.
        unsafe {
            let head_slot = self.head.get();
            let mut prev: *mut FreeBlock = ptr::null_mut();
            let mut curr = *head_slot;
            let block_addr = block as usize;

            while !curr.is_null() && (curr as usize) < block_addr {
                prev = curr;
                curr = (*curr).next;
            }

            (*block).next = curr;
            if prev.is_null() {
                *head_slot = block;
            } else {
                (*prev).next = block;
            }

            // 다음 블록과 인접하면 병합
            if !curr.is_null() {
                let block_end = block_addr
                    .saturating_add(HEADER_SIZE)
                    .saturating_add((*block).size);
                if block_end == (curr as usize) {
                    (*block).size = (*block)
                        .size
                        .saturating_add(HEADER_SIZE)
                        .saturating_add((*curr).size);
                    (*block).next = (*curr).next;
                }
            }

            // 이전 블록과 인접하면 병합
            if !prev.is_null() {
                let prev_end = (prev as usize)
                    .saturating_add(HEADER_SIZE)
                    .saturating_add((*prev).size);
                if prev_end == block_addr {
                    (*prev).size = (*prev)
                        .size
                        .saturating_add(HEADER_SIZE)
                        .saturating_add((*block).size);
                    (*prev).next = (*block).next;
                }
            }
        }
    }

    unsafe fn try_alloc_from_list(&self, req_size: usize, align: usize) -> *mut u8 {
        // SAFETY: 프리리스트 노드들은 유효한 선형 메모리 영역을 가리킨다.
        unsafe {
            let head_slot = self.head.get();
            let mut prev: *mut FreeBlock = ptr::null_mut();
            let mut curr = *head_slot;

            while !curr.is_null() {
                let block_addr = curr as usize;
                let data_start = block_addr + HEADER_SIZE;
                let Some(user_addr) = align_up(data_start + PTR_SIZE, align) else {
                    return ptr::null_mut();
                };
                let Some(total_used) = (user_addr - data_start).checked_add(req_size) else {
                    return ptr::null_mut();
                };

                if (*curr).size >= total_used {
                    let next_block = (*curr).next;
                    let remaining = (*curr).size - total_used;
                    if remaining >= HEADER_SIZE + 32 {
                        let rem_addr = data_start + total_used;
                        let rem = rem_addr as *mut FreeBlock;
                        (*rem).size = remaining - HEADER_SIZE;
                        (*rem).next = next_block;
                        (*curr).size = total_used;
                        if prev.is_null() {
                            *head_slot = rem;
                        } else {
                            (*prev).next = rem;
                        }
                    } else if prev.is_null() {
                        *head_slot = next_block;
                    } else {
                        (*prev).next = next_block;
                    }

                    // 해제 시 원본 헤더를 O(1) 복원하기 위해 사용자 포인터 직전에 헤더 주소를 기록한다.
                    *((user_addr - PTR_SIZE) as *mut usize) = block_addr;
                    return user_addr as *mut u8;
                }

                prev = curr;
                curr = (*curr).next;
            }
            ptr::null_mut()
        }
    }
}

// SAFETY: `GlobalAlloc` 계약(정렬·크기·null 실패 처리)을 단일 스레드 WASM 선형 메모리에서 만족한다.
unsafe impl GlobalAlloc for WasmFreeListAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        if layout.size() == 0 {
            return layout.align() as *mut u8;
        }
        let align = layout.align().max(MIN_ALIGN);
        let Some(req_size) = align_up(layout.size(), MIN_ALIGN) else {
            return ptr::null_mut();
        };

        // SAFETY: 단일 스레드 WASM 선형 메모리 프리리스트에서 할당 시도.
        unsafe {
            let existing = self.try_alloc_from_list(req_size, align);
            if !existing.is_null() {
                return existing;
            }

            let Some(min_bytes) = HEADER_SIZE
                .checked_add(align)
                .and_then(|v| v.checked_add(req_size))
            else {
                return ptr::null_mut();
            };
            let pages = min_bytes.div_ceil(PAGE_SIZE).max(MIN_GROW_PAGES);
            let prev_pages = wasm_memory_grow(pages);
            if prev_pages == usize::MAX {
                return ptr::null_mut();
            }

            let Some(new_addr) = prev_pages.checked_mul(PAGE_SIZE) else {
                return ptr::null_mut();
            };
            let new_bytes = pages * PAGE_SIZE;
            if new_addr == 0 || new_bytes <= HEADER_SIZE {
                return ptr::null_mut();
            }

            let new_block = new_addr as *mut FreeBlock;
            (*new_block).size = new_bytes - HEADER_SIZE;
            (*new_block).next = ptr::null_mut();
            self.insert_and_coalesce(new_block);
            self.try_alloc_from_list(req_size, align)
        }
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        if ptr.is_null() || layout.size() == 0 {
            return;
        }
        // SAFETY: `ptr`은 이 할당기의 `alloc`이 반환했으며 직전 `PTR_SIZE`에 유효한 `FreeBlock` 주소가 있다.
        unsafe {
            let block_addr = *((ptr as usize - PTR_SIZE) as *const usize);
            let block = block_addr as *mut FreeBlock;
            self.insert_and_coalesce(block);
        }
    }
}

#[global_allocator]
static GLOBAL_ALLOCATOR: WasmFreeListAllocator = WasmFreeListAllocator::new();

#[panic_handler]
fn wasm_panic_handler(_info: &core::panic::PanicInfo<'_>) -> ! {
    #[cfg(target_arch = "wasm64")]
    {
        core::arch::wasm64::unreachable()
    }
    #[cfg(target_arch = "wasm32")]
    {
        core::arch::wasm32::unreachable()
    }
}
