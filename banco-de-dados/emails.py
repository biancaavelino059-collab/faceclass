import os
import smtplib
import ssl
import time
import uuid
from email.message import EmailMessage

from banco import transacao


def enfileirar(cursor, presenca_id, destinatario, nome, tipo, momento, motivo):
    assunto = f"FaceClass: {nome} registrou {tipo}"
    corpo = (
        f"Olá!\n\n{nome} registrou {tipo} no FaceClass em "
        f"{momento:%d/%m/%Y}, às {momento:%H:%M:%S}.\n"
    )
    if motivo:
        corpo += f"Motivo da saída antecipada: {motivo}\n"
    corpo += "\nAviso automático do FaceClass."

    cursor.execute(
        """INSERT INTO notificacao_email
           (presenca_id, destinatario, assunto, corpo, status,
            tentativas, proxima_tentativa, criado_em)
           VALUES (%s, %s, %s, %s, 'pendente', 0,
                   UTC_TIMESTAMP(), UTC_TIMESTAMP())""",
        (presenca_id, destinatario, assunto, corpo),
    )


def reservar():
    with transacao() as (_, cursor):
        cursor.execute(
            """SELECT * FROM notificacao_email
               WHERE (status = 'pendente'
                      AND proxima_tentativa <= UTC_TIMESTAMP())
                  OR (status = 'enviando'
                      AND reservado_ate < UTC_TIMESTAMP())
               ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED"""
        )
        aviso = cursor.fetchone()
        if not aviso:
            return None
        if aviso["tentativas"] >= 5:
            cursor.execute(
                """UPDATE notificacao_email
                   SET status='falhou', reserva_token=NULL,
                       reservado_ate=NULL
                   WHERE id=%s""",
                (aviso["id"],),
            )
            return None

        token = uuid.uuid4().hex
        cursor.execute(
            """UPDATE notificacao_email
               SET status='enviando', tentativas=tentativas+1,
                   reserva_token=%s,
                   reservado_ate=DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE)
               WHERE id=%s""",
            (token, aviso["id"]),
        )
        aviso["reserva_token"] = token
        aviso["tentativas"] += 1
        return aviso


def validar_configuracao():
    if not os.getenv("SMTP_HOST") or not os.getenv("SMTP_FROM"):
        raise RuntimeError("Configure SMTP_HOST e SMTP_FROM antes de iniciar os e-mails.")
    if bool(os.getenv("SMTP_USER")) != bool(os.getenv("SMTP_PASSWORD")):
        raise RuntimeError("Configure SMTP_USER e SMTP_PASSWORD juntos.")
    if os.getenv("SMTP_HOST", "").lower() == "smtp.gmail.com" and not os.getenv("SMTP_USER"):
        raise RuntimeError("Para usar Gmail, configure SMTP_USER e a senha de aplicativo em SMTP_PASSWORD.")
    if os.getenv("SMTP_SECURITY", "starttls").lower() not in {"ssl", "starttls"}:
        raise RuntimeError("SMTP_SECURITY deve ser ssl ou starttls.")


def enviar(aviso):
    host = os.getenv("SMTP_HOST")
    remetente = os.getenv("SMTP_FROM")
    if not host or not remetente:
        raise RuntimeError("Configure SMTP_HOST e SMTP_FROM.")
    modo = os.getenv("SMTP_SECURITY", "starttls").lower()
    if modo not in {"ssl", "starttls"}:
        raise RuntimeError("SMTP_SECURITY deve ser ssl ou starttls.")

    mensagem = EmailMessage()
    mensagem["From"] = remetente
    mensagem["To"] = aviso["destinatario"]
    mensagem["Subject"] = aviso["assunto"]
    dominio = remetente.rsplit("@", 1)[-1]
    mensagem["Message-ID"] = f"<faceclass-presenca-{aviso['presenca_id']}@{dominio}>"
    mensagem.set_content(aviso["corpo"])

    porta = int(os.getenv("SMTP_PORT", "465" if modo == "ssl" else "587"))
    contexto = ssl.create_default_context()
    if modo == "ssl":
        smtp = smtplib.SMTP_SSL(host, porta, timeout=20, context=contexto)
    else:
        smtp = smtplib.SMTP(host, porta, timeout=20)

    with smtp:
        if modo == "starttls":
            smtp.ehlo()
            smtp.starttls(context=contexto)
            smtp.ehlo()
        usuario = os.getenv("SMTP_USER")
        if usuario:
            smtp.login(usuario, os.environ["SMTP_PASSWORD"])
        recusados = smtp.send_message(mensagem)
        if recusados:
            raise RuntimeError("O servidor recusou o destinatário.")


def concluir(aviso, erro=None):
    with transacao() as (_, cursor):
        if erro is None:
            cursor.execute(
                """UPDATE notificacao_email
                   SET status='enviado', enviado_em=UTC_TIMESTAMP(),
                       reserva_token=NULL, reservado_ate=NULL, ultimo_erro=NULL
                   WHERE id=%s AND status='enviando' AND reserva_token=%s""",
                (aviso["id"], aviso["reserva_token"]),
            )
        else:
            status = "falhou" if aviso["tentativas"] >= 5 else "pendente"
            atraso = min(3600, 60 * (2 ** (aviso["tentativas"] - 1)))
            cursor.execute(
                """UPDATE notificacao_email
                   SET status=%s, ultimo_erro=%s,
                       proxima_tentativa=DATE_ADD(UTC_TIMESTAMP(), INTERVAL %s SECOND),
                       reserva_token=NULL, reservado_ate=NULL
                   WHERE id=%s AND status='enviando' AND reserva_token=%s""",
                (status, type(erro).__name__, atraso,
                 aviso["id"], aviso["reserva_token"]),
            )


if __name__ == "__main__":
    try:
        validar_configuracao()
    except (RuntimeError, ValueError) as erro:
        print(f"E-mails não iniciados: {erro}")
        raise SystemExit(1)
    print("Processador de e-mails iniciado. Ctrl+C para parar.")
    try:
        while True:
            try:
                aviso = reservar()
                if not aviso:
                    time.sleep(5)
                    continue
                try:
                    enviar(aviso)
                except Exception as erro:
                    concluir(aviso, erro)
                    print(f"Aviso {aviso['id']}: tentativa falhou ({type(erro).__name__}).")
                else:
                    concluir(aviso)
                    print(f"Aviso {aviso['id']}: aceito pelo servidor de e-mail.")
            except Exception as erro:
                print(f"Processador aguardando: {type(erro).__name__}.")
                time.sleep(5)
    except KeyboardInterrupt:
        print("\nProcessador encerrado.")
