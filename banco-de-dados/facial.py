import base64
import io
import json
import math
import os
from pathlib import Path
from threading import Lock

import cv2
import numpy as np
from cryptography.fernet import Fernet, InvalidToken
from PIL import Image, UnidentifiedImageError

MODELO = "sface-2021dec-v1"
BASE = Path(__file__).resolve().parent
TRAVA = Lock()
detector = None
reconhecedor = None


class ErroFacial(Exception):
    pass


def chave():
    valor = os.getenv("FACE_ENCRYPTION_KEY")
    if not valor:
        raise RuntimeError("Configure FACE_ENCRYPTION_KEY no .env.")
    return Fernet(valor.encode("ascii"))


def extrair(imagem):
    global detector, reconhecedor

    if not isinstance(imagem, str) or len(imagem) > 4_000_000:
        raise ErroFacial("Envie uma captura da câmera com tamanho menor.")

    if not imagem.startswith(("data:image/jpeg;base64,", "data:image/png;base64,")):
        raise ErroFacial("A captura deve ser JPEG ou PNG em base64.")

    try:
        dados = base64.b64decode(imagem.split(",", 1)[1], validate=True)
        if not dados or len(dados) > 2_500_000:
            raise ErroFacial("Imagem muito grande ou vazia.")

        with Image.open(io.BytesIO(dados)) as original:
            largura, altura = original.size
            if original.format not in {"JPEG", "PNG"}:
                raise ErroFacial("Formato da imagem não permitido.")
            if min(largura, altura) < 160 or largura * altura > 3_000_000:
                raise ErroFacial("Envie uma foto nítida, de até 3 megapixels.")
            rgb = np.asarray(original.convert("RGB"))

        frame = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    except ErroFacial:
        raise
    except (ValueError, OSError, UnidentifiedImageError, Image.DecompressionBombError):
        raise ErroFacial("Não foi possível ler a captura da câmera.") from None

    h, w = frame.shape[:2]
    escala = min(1.0, 960 / max(h, w))
    if escala < 1:
        frame = cv2.resize(frame, (int(w * escala), int(h * escala)))

    h, w = frame.shape[:2]
    with TRAVA:
        if detector is None:
            pasta = BASE / "modelos"
            deteccao = pasta / "face_detection_yunet_2023mar.onnx"
            reconhecimento = pasta / "face_recognition_sface_2021dec.onnx"
            if not deteccao.is_file() or not reconhecimento.is_file():
                raise RuntimeError("Baixe os dois modelos faciais na pasta modelos.")
            novo_detector = cv2.FaceDetectorYN.create(
                str(deteccao), "", (w, h), 0.9, 0.3, 5000
            )
            novo_reconhecedor = cv2.FaceRecognizerSF.create(str(reconhecimento), "")
            detector, reconhecedor = novo_detector, novo_reconhecedor

        detector.setInputSize((w, h))
        _, rostos = detector.detect(frame)
        if rostos is None or len(rostos) != 1:
            raise ErroFacial("A captura precisa mostrar exatamente um rosto.")
        rosto = rostos[0]
        if min(rosto[2], rosto[3]) < 100:
            raise ErroFacial("Aproxime o rosto da câmera e tente novamente.")

        alinhado = reconhecedor.alignCrop(frame, rosto)
        vetor = reconhecedor.feature(alinhado).copy().reshape(-1)

    vetor = np.asarray(vetor, dtype=np.float32)
    norma = float(np.linalg.norm(vetor.astype(np.float64)))
    if (
        vetor.size < 1
        or not np.all(np.isfinite(vetor))
        or not math.isfinite(norma)
        or norma <= 1e-8
    ):
        raise ErroFacial("Não foi possível analisar o rosto.")
    return (vetor.astype(np.float64) / norma).astype(np.float32)


def guardar(vetor):
    texto = json.dumps(vetor.tolist()).encode("utf-8")
    return chave().encrypt(texto).decode("ascii")


def conferir(imagem, template, modelo):
    if not template:
        raise ErroFacial("Cadastre seu rosto antes de registrar presença.")
    if modelo != MODELO:
        raise ErroFacial("Seu cadastro facial precisa ser atualizado.")

    atual = extrair(imagem)
    try:
        texto = chave().decrypt(template.encode("ascii"))
        salvo = np.asarray(json.loads(texto), dtype=np.float32)
        if salvo.shape != atual.shape or not np.all(np.isfinite(salvo)):
            raise ValueError()
        norma = float(np.linalg.norm(salvo.astype(np.float64)))
        if not math.isfinite(norma) or norma <= 1e-8:
            raise ValueError()
        salvo = (salvo.astype(np.float64) / norma).astype(np.float32)
    except (InvalidToken, ValueError, TypeError, UnicodeError):
        raise RuntimeError("Não foi possível abrir o cadastro facial.") from None

    limite = float(os.getenv("FACE_THRESHOLD", "0.5"))
    if not math.isfinite(limite) or not 0 < limite <= 1:
        raise RuntimeError("FACE_THRESHOLD precisa estar entre 0 e 1.")
    semelhanca = float(np.dot(atual, salvo))
    return math.isfinite(semelhanca) and semelhanca >= limite
