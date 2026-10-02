"""Prepara modelos e configuração local; não modifica o MySQL."""
import base64
import hashlib
import os
from pathlib import Path
import secrets
import urllib.request

BASE = Path(__file__).resolve().parent
MODELOS = {
    "face_detection_yunet_2023mar.onnx": (
        "https://huggingface.co/opencv/opencv_zoo/resolve/main/models/"
        "face_detection_yunet/face_detection_yunet_2023mar.onnx",
        "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
    ),
    "face_recognition_sface_2021dec.onnx": (
        "https://huggingface.co/opencv/opencv_zoo/resolve/main/models/"
        "face_recognition_sface/face_recognition_sface_2021dec.onnx",
        "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
    ),
}


def hash_arquivo(caminho):
    resumo = hashlib.sha256()
    with caminho.open("rb") as arquivo:
        for bloco in iter(lambda: arquivo.read(1024 * 1024), b""):
            resumo.update(bloco)
    return resumo.hexdigest()


def preparar_modelos():
    pasta = BASE / "modelos"
    pasta.mkdir(exist_ok=True)
    for nome, (url, esperado) in MODELOS.items():
        destino = pasta / nome
        if destino.is_file() and hash_arquivo(destino) == esperado:
            print(f"Modelo verificado: {nome}")
            continue
        temporario = pasta / (nome + ".part")
        print(f"Baixando modelo oficial: {nome}")
        try:
            with urllib.request.urlopen(url, timeout=60) as resposta:
                with temporario.open("wb") as arquivo:
                    total = 0
                    while bloco := resposta.read(1024 * 1024):
                        total += len(bloco)
                        if total > 100 * 1024 * 1024:
                            raise RuntimeError("Download excedeu o tamanho permitido.")
                        arquivo.write(bloco)
            if hash_arquivo(temporario) != esperado:
                raise RuntimeError("O hash do modelo não confere; arquivo não utilizado.")
            temporario.replace(destino)
        finally:
            if temporario.exists():
                temporario.unlink()


def preparar_env():
    destino = BASE / ".env"
    if destino.exists():
        print(".env existente preservado; nenhuma chave foi trocada.")
        return
    exemplo = (BASE / ".env.example").read_text(encoding="utf-8-sig")
    exemplo = exemplo.replace("COLE_A_CHAVE_GERADA", secrets.token_hex(32))
    chave_facial = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode("ascii")
    exemplo = exemplo.replace("COLE_A_CHAVE_FACIAL_GERADA", chave_facial)
    # Modo exclusivo: nunca sobrescrever uma configuração criada em paralelo.
    with destino.open("x", encoding="utf-8") as arquivo:
        arquivo.write(exemplo)
    print(".env criado com chaves persistentes. Preencha MySQL e SMTP localmente.")


if __name__ == "__main__":
    try:
        preparar_modelos()
        preparar_env()
    except Exception as erro:
        print(f"Preparação falhou: {type(erro).__name__}: {erro}")
        raise SystemExit(1)
