(() => {
  const DRAW_START_URL = '/studio?drawingShell=app&uiMode=focus&startTool=draw&source=pwa';
  let installPrompt = null;
  let installButton = null;
  let statusNode = null;
  let canLaunch = false;
  let helpNode = null;

  const isIos = () => /iPad|iPhone|iPod/u.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const isStandalone = () => Boolean(navigator.standalone)
    || (typeof window.matchMedia === 'function'
      && window.matchMedia('(display-mode: standalone)').matches);

  const setStatus = (message) => {
    if (statusNode) statusNode.textContent = message;
  };

  const hideHelp = () => {
    if (helpNode) helpNode.hidden = true;
    installButton?.removeAttribute('aria-expanded');
    installButton?.removeAttribute('aria-controls');
  };

  const showReady = () => {
    if (!installButton) return;
    hideHelp();
    installButton.disabled = false;
    installButton.textContent = '툰스튜디오 드로잉 설치';
    setStatus('설치를 누르면 브라우저의 설치 창이 열립니다.');
  };

  const showManual = (expanded = false) => {
    if (!installButton || !helpNode) return;
    installButton.disabled = false;
    installButton.textContent = isIos() ? '홈 화면에 추가 방법' : '브라우저 설치 방법';
    installButton.setAttribute('aria-controls', helpNode.id);
    installButton.setAttribute('aria-expanded', String(expanded));
    helpNode.textContent = isIos()
      ? 'Safari에서 공유 버튼을 누른 뒤 ‘홈 화면에 추가’를 선택하세요.'
      : '브라우저 메뉴에서 ‘앱 설치’, ‘바로가기 설치’ 또는 ‘Dock에 추가’를 선택하세요.';
    helpNode.hidden = !expanded;
    setStatus('이 브라우저에서는 메뉴에서 설치할 수 있습니다.');
  };

  const showLaunch = (message) => {
    canLaunch = true;
    installPrompt = null;
    if (!installButton) return;
    hideHelp();
    installButton.disabled = false;
    installButton.textContent = '작품 보관함 열기';
    setStatus(message);
  };

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    if (canLaunch) return;
    installPrompt = event;
    showReady();
  });

  window.addEventListener('appinstalled', () => {
    showLaunch('설치를 마쳤습니다. 홈 화면에서 작품 보관함을 열 수 있습니다.');
  });

  document.addEventListener('DOMContentLoaded', () => {
    installButton = document.getElementById('install-app');
    statusNode = document.getElementById('install-status');
    helpNode = document.getElementById('install-help');
    if (!installButton || !statusNode) return;

    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        const offlineStatus = document.getElementById('offline-status');
        if (offlineStatus) {
          offlineStatus.textContent = '오프라인 작업을 준비하지 못했습니다. 연결을 확인한 뒤 새로고침하세요.';
          offlineStatus.hidden = false;
        }
      });
    }

    if (canLaunch || isStandalone()) {
      showLaunch('작품 보관함에서 원고를 선택하세요.');
    } else if (installPrompt) {
      showReady();
    } else {
      showManual();
    }

    installButton.addEventListener('click', async () => {
      if (canLaunch) {
        window.location.href = DRAW_START_URL;
        return;
      }
      if (!installPrompt) {
        showManual(Boolean(helpNode?.hidden));
        return;
      }

      const prompt = installPrompt;
      installPrompt = null;
      installButton.disabled = true;
      installButton.textContent = '설치 확인 중…';
      setStatus('브라우저 설치 창에서 계속해 주세요.');
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (canLaunch) return;
        if (choice.outcome === 'accepted') {
          showLaunch('설치 요청을 수락했습니다. 작품 보관함에서 작업을 시작하세요.');
        } else {
          showManual();
          setStatus('설치를 취소했습니다. 다시 설치하려면 설치 방법을 확인하세요.');
        }
      } catch {
        if (!canLaunch) showManual(true);
      }
    });
  });
})();
