"""Offline-only DINO configuration for the upstream TripoSR tokenizer."""
import os
from pathlib import Path
import torch
from transformers import ViTConfig
from transformers.models.vit.modeling_vit import ViTModel
from tsr.models.tokenizers.image import DINOSingleImageTokenizer

class LocalDINOImageTokenizer(DINOSingleImageTokenizer):
    def configure(self):
        directory=Path(os.environ.get('CREATOR_MODEL_ROOT','/models'))/'dino'
        self.model=ViTModel(ViTConfig.from_pretrained(str(directory),local_files_only=True))
        if self.cfg.enable_gradient_checkpointing:
            # transformers 5.x 의 ViTModel 에는 encoder 속성이 없다. 공개 API 로 켜면 4.x 와 5.x 모두에서 동작한다.
            self.model.gradient_checkpointing_enable()
        self.register_buffer('image_mean',torch.tensor([.485,.456,.406]).reshape(1,1,3,1,1),persistent=False)
        self.register_buffer('image_std',torch.tensor([.229,.224,.225]).reshape(1,1,3,1,1),persistent=False)
