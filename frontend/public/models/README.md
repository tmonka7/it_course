# AI models

The AI Detection and My Profile pages run these ONNX models in the browser with onnxruntime-web (see `frontend/src/vision/`).
They are served as static files from `/models/`, so nothing is sent to an outside service.

| File | Used for | Source | License |
|---|---|---|---|
| `yolo26n.onnx` (9.9 MB) | Object detection, 80 COCO classes. Input `images` 1×3×640×640 RGB 0–1; output `output0` 1×300×6 (`x1, y1, x2, y2, score, class`, NMS-free) | [Ultralytics assets v8.4.0](https://github.com/ultralytics/assets/releases/download/v8.4.0/yolo26n.onnx) | AGPL-3.0 (Ultralytics). Commercial use outside AGPL terms needs an Ultralytics Enterprise license. |
| `face_detection_yunet_2023mar.onnx` (0.2 MB) | Face detection with 5 landmarks. Input 1×3×640×640 BGR 0–255 | [OpenCV Zoo: YuNet](https://huggingface.co/opencv/face_detection_yunet) | MIT |
| `face_recognition_sface_2021dec.onnx` (37 MB) | Face embedding (128 numbers) for recognition. Input 1×3×112×112 RGB 0–255, aligned face. The int8 version is smaller but about 6× slower in the browser. | [OpenCV Zoo: SFace](https://huggingface.co/opencv/face_recognition_sface) | Apache-2.0 |

SHA-256:

```
2e947b787d9e787b93a16772a5f55b1d4d8c4d86f53146149c5d6a642442d6f7  yolo26n.onnx
8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4  face_detection_yunet_2023mar.onnx
0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79  face_recognition_sface_2021dec.onnx
```

To use a different YOLO26 size (s/m/l), export it with `yolo export model=yolo26s.pt format=onnx` and change `MODELS.yolo` in `frontend/src/vision/worker.js`.
