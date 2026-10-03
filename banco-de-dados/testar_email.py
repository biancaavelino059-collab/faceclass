"""Envia um único e-mail de teste para o próprio remetente, sem usar o banco."""

import os
import uuid

from emails import enviar, validar_configuracao


def main():
    validar_configuracao()
    destinatario = os.environ["SMTP_USER"]
    if destinatario.casefold() != os.environ["SMTP_FROM"].casefold():
        raise RuntimeError("No teste local, SMTP_USER e SMTP_FROM devem ser iguais.")

    aviso = {
        "presenca_id": f"teste-{uuid.uuid4().hex}",
        "destinatario": destinatario,
        "assunto": "FaceClass: teste de e-mail local",
        "corpo": (
            "Este é apenas um teste do envio de e-mail do FaceClass.\n"
            "Nenhuma entrada ou saída de aluno foi registrada.\n"
        ),
    }
    enviar(aviso)
    print("E-mail de teste aceito pelo servidor SMTP. Confira a caixa de entrada e o spam.")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as erro:
        print(f"Teste de e-mail falhou: {erro}")
        raise SystemExit(1)
    except (OSError, ValueError) as erro:
        print(f"Teste de e-mail falhou: {type(erro).__name__}.")
        raise SystemExit(1)
