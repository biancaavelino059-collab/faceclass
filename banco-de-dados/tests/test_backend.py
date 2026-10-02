r"""Testes locais: sem MySQL, SMTP, rede, modelos ou imagens de pessoas.

Executar em banco-de-dados:
    ..\.venv-web\Scripts\python.exe -m unittest discover -s tests -v

As configurações usadas aqui são fictícias. O import impede a leitura de .env.
"""

import json
import os
import sys
import unittest
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
from cryptography.fernet import Fernet
from werkzeug.security import generate_password_hash


BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE))
FACE_KEY = Fernet.generate_key().decode("ascii")
CONFIG_TESTE = {
    "APP_SECRET": "segredo-exclusivo-dos-testes-locais-1234567890",
    "APP_HTTPS": "false",
    "FACE_ENCRYPTION_KEY": FACE_KEY,
    "FACE_THRESHOLD": "0.5",
    "ESCOLA_LATITUDE": "0",
    "ESCOLA_LONGITUDE": "0",
    "ESCOLA_RAIO_METROS": "100",
    "GPS_PRECISAO_MAX_METROS": "100",
    "HORARIO_SAIDA": "12:10",
    "SMTP_HOST": "smtp.example.invalid",
    "SMTP_FROM": "faceclass@example.invalid",
    "SMTP_SECURITY": "starttls",
    "SMTP_USER": "",
    "SMTP_PASSWORD": "",
}

with patch("dotenv.load_dotenv", return_value=False), patch.dict(
    os.environ, CONFIG_TESTE
):
    import app as api
    import banco
    import emails
    import facial
    import testar_email


SENHA = "  senha-de-teste-123  "
HASH_TESTE = generate_password_hash(SENHA, method="pbkdf2:sha256:1000")
ALUNO = {
    "id": 31,
    "nome": "Aluno Exemplo",
    "RA": "TESTE12345",
    "email": "aluno@example.invalid",
    "nome_responsavel": "Responsavel Exemplo",
    "email_responsavel": "responsavel@example.invalid",
    "telefone_responsavel": "11900000000",
    "rosto_cadastrado": 0,
}


def transacao_falsa(cursor):
    @contextmanager
    def transacao():
        yield MagicMock(), cursor

    return transacao


class Isolado(unittest.TestCase):
    def setUp(self):
        self.addCleanup(patch.stopall)
        patch.dict(os.environ, CONFIG_TESTE).start()
        patch.object(
            banco,
            "conectar",
            side_effect=AssertionError("Um teste tentou usar um banco real."),
        ).start()
        patch.object(
            emails.smtplib,
            "SMTP",
            side_effect=AssertionError("Um teste tentou acessar SMTP real."),
        ).start()
        patch.object(
            emails.smtplib,
            "SMTP_SSL",
            side_effect=AssertionError("Um teste tentou acessar SMTP_SSL real."),
        ).start()
        api.app.config.update(TESTING=True, SESSION_COOKIE_SECURE=False)


class HelpersAPI(Isolado):
    def test_ra_normaliza_sem_perder_zeros(self):
        self.assertEqual(api.ra_normalizado({"RA": "  0000-ab 123  "}), "0000AB123")

    def test_ra_rejeita_tipos_simbolos_e_comprimento(self):
        for valor in (None, [], {}, True, "1234", "A" * 21, "TEST@123", "TEST\t123"):
            with self.subTest(valor=valor), self.assertRaises(api.ErroAPI):
                api.ra_normalizado({"RA": valor})

    def test_email_normaliza_e_rejeita_injecao(self):
        self.assertEqual(
            api.email_validado({"email": " Aluno@Example.Invalid "}, "email"),
            "aluno@example.invalid",
        )
        for valor in ("sem-arroba", "dois@@example.invalid", "a\r\nb@example.invalid"):
            with self.subTest(valor=valor), self.assertRaises(api.ErroAPI):
                api.email_validado({"email": valor}, "email")

    def test_senha_preserva_espacos(self):
        self.assertEqual(api.texto({"senha": SENHA}, "senha", 128, 8, aparar=False), SENHA)

    def test_texto_rejeita_nulos_controles_e_tipo_incorreto(self):
        for valor in ("nome\x00sobrenome", "nome\nsobrenome", 123, ["nome"]):
            with self.subTest(valor=valor), self.assertRaises(api.ErroAPI):
                api.texto({"nome": valor}, "nome", 100)

    def test_numero_aceita_limites(self):
        self.assertEqual(api.numero({"n": -90}, "n", -90, 90), -90.0)
        self.assertEqual(api.numero({"n": 90.0}, "n", -90, 90), 90.0)

    def test_numero_rejeita_booleanos_strings_nan_infinito(self):
        for valor in (True, False, "12", None, [], float("nan"), float("inf"), -91):
            with self.subTest(valor=valor), self.assertRaises(api.ErroAPI):
                api.numero({"n": valor}, "n", -90, 90)

    def test_distancia_em_metros(self):
        self.assertEqual(api.distancia(0, 0, 0, 0), 0)
        self.assertAlmostEqual(api.distancia(0, 0, 0, 1), 111194.9266, places=2)

    def test_local_aceita_ponto_da_escola(self):
        self.assertEqual(
            api.validar_local({"latitude": 0, "longitude": 0, "precisao": 20}),
            (0.0, 0.0),
        )

    def test_local_rejeita_fora_do_raio(self):
        with self.assertRaises(api.ErroAPI) as erro:
            api.validar_local({"latitude": 1, "longitude": 0, "precisao": 20})
        self.assertEqual(erro.exception.status, 403)

    def test_local_rejeita_precisao_ruim(self):
        with self.assertRaises(api.ErroAPI) as erro:
            api.validar_local({"latitude": 0, "longitude": 0, "precisao": 101})
        self.assertEqual(erro.exception.status, 422)

    def test_local_rejeita_configuracao_nan_ou_fora_do_intervalo(self):
        for nome, valor in (
            ("ESCOLA_LATITUDE", "nan"),
            ("ESCOLA_LONGITUDE", "181"),
            ("ESCOLA_RAIO_METROS", "0"),
            ("GPS_PRECISAO_MAX_METROS", "inf"),
        ):
            with self.subTest(nome=nome), patch.dict(os.environ, {nome: valor}):
                with self.assertRaises(RuntimeError):
                    api.validar_local({"latitude": 0, "longitude": 0, "precisao": 20})

    def test_aluno_publico_nao_expoe_senha_ou_template(self):
        linha = dict(ALUNO, senha="hash-ficticio", rosto_template="template-ficticio")
        retorno = api.aluno_publico(linha)
        self.assertEqual(retorno["responsavel"]["email"], ALUNO["email_responsavel"])
        self.assertNotIn("senha", retorno)
        self.assertNotIn("rosto_template", retorno)


class SessaoAPI(Isolado):
    def setUp(self):
        super().setUp()
        self.client = api.app.test_client()
        self.cursor = MagicMock()
        self.cursor.lastrowid = ALUNO["id"]

    def token(self):
        resposta = self.client.get("/sessao")
        self.assertEqual(resposta.status_code, 200)
        return resposta.get_json()["csrf_token"]

    def post(self, caminho, dados, token, origem="http://localhost"):
        return self.client.post(
            caminho,
            json=dados,
            headers={"X-CSRF-Token": token, "Origin": origem},
        )

    def entrar_fake(self):
        token = self.token()
        with self.client.session_transaction() as sessao:
            sessao["aluno_id"] = ALUNO["id"]
        return token

    def test_sessao_anonima_token_e_cache(self):
        resposta = self.client.get("/sessao")
        self.assertEqual(resposta.status_code, 200)
        self.assertIsNone(resposta.get_json()["aluno"])
        self.assertGreaterEqual(len(resposta.get_json()["csrf_token"]), 32)
        self.assertEqual(resposta.headers["Cache-Control"], "no-store")

    def test_post_sem_csrf_rejeitado(self):
        self.assertEqual(self.client.post("/login", json={}).status_code, 403)

    def test_csrf_errado_ou_nao_ascii_rejeitado(self):
        self.token()
        for token in ("errado", "token-é"):
            with self.subTest(token=token):
                self.assertEqual(self.post("/login", {}, token).status_code, 403)

    def test_origem_externa_rejeitada(self):
        resposta = self.post("/login", {}, self.token(), "https://outro.example.invalid")
        self.assertEqual(resposta.status_code, 403)

    def test_corpo_json_precisa_ser_objeto(self):
        resposta = self.post("/login", [], self.token())
        self.assertEqual(resposta.status_code, 400)

    def test_get_historia_exige_autenticacao(self):
        for caminho in ("/presencas", "/presencas/31"):
            with self.subTest(caminho=caminho):
                self.assertEqual(self.client.get(caminho).status_code, 401)

    def test_get_alunos_nao_divulga_cadastros(self):
        self.assertEqual(self.client.get("/alunos").status_code, 405)

    def test_aluno_nao_consulta_historico_de_outro(self):
        self.entrar_fake()
        self.assertEqual(self.client.get("/presencas/32").status_code, 403)

    def test_presenca_nao_aceita_tipo_array_ou_objeto(self):
        token = self.entrar_fake()
        for tipo in ([], {}, 1, None, "qualquer"):
            with self.subTest(tipo=tipo):
                self.assertEqual(self.post("/presenca", {"tipo": tipo}, token).status_code, 400)

    def test_signup_rotaciona_token_e_hash_recebe_senha_original(self):
        token = self.token()
        dados = {
            "nome": ALUNO["nome"],
            "RA": "teste-12345",
            "email": ALUNO["email"],
            "senha": SENHA,
            "nome_responsavel": ALUNO["nome_responsavel"],
            "email_responsavel": ALUNO["email_responsavel"],
            "telefone_responsavel": "(11) 90000-0000",
        }
        self.cursor.fetchone.return_value = dict(ALUNO)
        with patch.object(api, "transacao", transacao_falsa(self.cursor)):
            with patch.object(api, "generate_password_hash", return_value=HASH_TESTE) as gerar:
                resposta = self.post("/alunos", dados, token)
        self.assertEqual(resposta.status_code, 201)
        gerar.assert_called_once_with(SENHA)
        retorno = resposta.get_json()
        self.assertNotEqual(retorno["csrf_token"], token)
        self.assertEqual(retorno["aluno"]["RA"], ALUNO["RA"])
        self.assertNotIn("senha", retorno["aluno"])
        self.assertNotIn("rosto_template", retorno["aluno"])
        with self.client.session_transaction() as sessao:
            self.assertEqual(sessao["aluno_id"], ALUNO["id"])

    def test_login_rotaciona_csrf_e_senha_tem_espacos(self):
        token = self.token()
        self.cursor.fetchone.side_effect = [
            {"id": ALUNO["id"], "senha": HASH_TESTE},
            dict(ALUNO),
        ]
        with patch.object(api, "transacao", transacao_falsa(self.cursor)):
            resposta = self.post("/login", {"RA": ALUNO["RA"], "senha": SENHA}, token)
        self.assertEqual(resposta.status_code, 200)
        novo = resposta.get_json()["csrf_token"]
        self.assertNotEqual(novo, token)
        self.assertEqual(self.post("/logout", {}, token).status_code, 403)
        self.assertEqual(self.post("/logout", {}, novo).status_code, 200)

    def test_login_errado_nao_cria_sessao(self):
        token = self.token()
        self.cursor.fetchone.return_value = {"id": ALUNO["id"], "senha": HASH_TESTE}
        with patch.object(api, "transacao", transacao_falsa(self.cursor)):
            resposta = self.post("/login", {"RA": ALUNO["RA"], "senha": "senha-errada"}, token)
        self.assertEqual(resposta.status_code, 401)
        with self.client.session_transaction() as sessao:
            self.assertNotIn("aluno_id", sessao)

    def test_logout_entrega_novo_token_anonimo(self):
        token = self.entrar_fake()
        resposta = self.post("/logout", {}, token)
        self.assertEqual(resposta.status_code, 200)
        novo = resposta.get_json()["csrf_token"]
        self.assertNotEqual(novo, token)
        self.assertEqual(self.client.get("/sessao").get_json(), {"aluno": None, "csrf_token": novo})

    def test_historico_expoe_apenas_campos_do_contrato(self):
        self.entrar_fake()
        self.cursor.fetchall.return_value = [
            {"id": 71, "tipo": "entrada", "data": "2026-10-02", "horario": "07:10:00",
             "motivo_saida": None, "notificacao": "pendente"}
        ]
        with patch.object(api, "transacao", transacao_falsa(self.cursor)):
            resposta = self.client.get("/presencas")
        self.assertEqual(resposta.status_code, 200)
        retorno = resposta.get_json()
        self.assertRegex(retorno["hoje"], r"^\d{4}-\d{2}-\d{2}$")
        self.assertEqual(retorno["presencas"][0]["notificacao"], "pendente")
        self.assertEqual(self.cursor.execute.call_args.args[1], (ALUNO["id"],))


class FacialSemModelos(Isolado):
    def setUp(self):
        super().setUp()
        self.vetor = np.array([1.0, 0.0, 0.0], dtype=np.float32)

    def test_template_criptografado_preserva_vetor(self):
        template = facial.guardar(self.vetor)
        bruto = json.loads(facial.chave().decrypt(template.encode("ascii")))
        self.assertEqual(bruto, [1.0, 0.0, 0.0])
        self.assertNotIn("[1.0", template)

    def test_comparacao_aceita_mesmo_vetor(self):
        template = facial.guardar(self.vetor)
        with patch.object(facial, "extrair", return_value=self.vetor):
            self.assertTrue(facial.conferir("captura-ficticia", template, facial.MODELO))

    def test_comparacao_rejeita_vetor_diferente(self):
        template = facial.guardar(self.vetor)
        diferente = np.array([0.0, 1.0, 0.0], dtype=np.float32)
        with patch.object(facial, "extrair", return_value=diferente):
            self.assertFalse(facial.conferir("captura-ficticia", template, facial.MODELO))

    def test_modelo_diferente_ou_template_ausente_nao_extrai(self):
        with patch.object(facial, "extrair") as extrair:
            for template, modelo in ((None, facial.MODELO), ("qualquer", "outro-modelo")):
                with self.subTest(modelo=modelo), self.assertRaises(facial.ErroFacial):
                    facial.conferir("captura-ficticia", template, modelo)
            extrair.assert_not_called()

    def test_template_corrompido_nao_autoriza(self):
        with patch.object(facial, "extrair", return_value=self.vetor):
            with self.assertRaises(RuntimeError):
                facial.conferir("captura-ficticia", "template-invalido", facial.MODELO)

    def test_vetor_salvo_shape_zero_ou_nan_rejeitado(self):
        for vetor in (
            np.array([1.0, 0.0], dtype=np.float32),
            np.zeros(3, dtype=np.float32),
            np.array([float("nan"), 0.0, 0.0], dtype=np.float32),
        ):
            with self.subTest(vetor=str(vetor)):
                template = facial.guardar(vetor)
                with patch.object(facial, "extrair", return_value=self.vetor):
                    with self.assertRaises(RuntimeError):
                        facial.conferir("captura-ficticia", template, facial.MODELO)

    def test_threshold_invalido_nao_autoriza(self):
        template = facial.guardar(self.vetor)
        for limite in ("nan", "inf", "0", "1.1"):
            with self.subTest(limite=limite), patch.dict(os.environ, {"FACE_THRESHOLD": limite}):
                with patch.object(facial, "extrair", return_value=self.vetor):
                    with self.assertRaises(RuntimeError):
                        facial.conferir("captura-ficticia", template, facial.MODELO)

    def test_captura_invalida_rejeitada_antes_dos_modelos(self):
        for imagem in (None, {}, "captura-ficticia", "data:image/jpeg;base64,!invalido!"):
            with self.subTest(imagem=imagem), self.assertRaises(facial.ErroFacial):
                facial.extrair(imagem)


class EmailsSemSMTP(Isolado):
    def setUp(self):
        super().setUp()
        self.cursor = MagicMock()
        self.aviso = {
            "id": 9,
            "presenca_id": 71,
            "destinatario": "responsavel@example.invalid",
            "assunto": "Aviso ficticio",
            "corpo": "Mensagem somente para teste.",
            "tentativas": 1,
            "reserva_token": "reserva-ficticia",
        }

    def test_enfileirar_nao_envia_email(self):
        momento = datetime(2026, 10, 2, 7, 10)
        emails.enfileirar(self.cursor, 71, self.aviso["destinatario"],
                         "Aluno Exemplo", "entrada", momento, "")
        sql, valores = self.cursor.execute.call_args.args
        self.assertIn("INSERT INTO notificacao_email", sql)
        self.assertIn("'pendente'", sql)
        self.assertEqual(valores[:2], (71, self.aviso["destinatario"]))
        self.assertIn("02/10/2026", valores[3])
        self.assertIn("07:10:00", valores[3])

    def test_reserva_fila_vazia(self):
        self.cursor.fetchone.return_value = None
        with patch.object(emails, "transacao", transacao_falsa(self.cursor)):
            self.assertIsNone(emails.reservar())
        self.assertIn("FOR UPDATE SKIP LOCKED", self.cursor.execute.call_args.args[0])

    def test_reserva_acrescenta_tentativa_e_token(self):
        self.cursor.fetchone.return_value = dict(self.aviso, tentativas=0, reserva_token=None)
        with patch.object(emails, "transacao", transacao_falsa(self.cursor)):
            retorno = emails.reservar()
        self.assertEqual(retorno["tentativas"], 1)
        self.assertRegex(retorno["reserva_token"], "^[0-9a-f]{32}$")
        self.assertIn("status='enviando'", self.cursor.execute.call_args.args[0])

    def test_reserva_nao_ultrapassa_cinco_tentativas(self):
        self.cursor.fetchone.return_value = dict(self.aviso, tentativas=5)
        with patch.object(emails, "transacao", transacao_falsa(self.cursor)):
            self.assertIsNone(emails.reservar())
        self.assertIn("status='falhou'", self.cursor.execute.call_args.args[0])

    def test_concluir_sucesso_exige_mesma_reserva(self):
        with patch.object(emails, "transacao", transacao_falsa(self.cursor)):
            emails.concluir(self.aviso)
        sql, valores = self.cursor.execute.call_args.args
        self.assertIn("status='enviado'", sql)
        self.assertIn("reserva_token=%s", sql)
        self.assertEqual(valores, (9, "reserva-ficticia"))

    def test_concluir_falha_agenda_retry_sem_gravar_erro_sensivel(self):
        with patch.object(emails, "transacao", transacao_falsa(self.cursor)):
            emails.concluir(dict(self.aviso, tentativas=2), RuntimeError("conteudo-confidencial"))
        sql, valores = self.cursor.execute.call_args.args
        self.assertEqual(valores[:3], ("pendente", "RuntimeError", 120))
        self.assertNotIn("conteudo-confidencial", str(valores))
        self.assertIn("reserva_token=%s", sql)

    def test_concluir_quinta_falha_encerra_retry(self):
        with patch.object(emails, "transacao", transacao_falsa(self.cursor)):
            emails.concluir(dict(self.aviso, tentativas=5), RuntimeError("falha ficticia"))
        self.assertEqual(self.cursor.execute.call_args.args[1][0], "falhou")

    def test_configuracao_rejeita_login_parcial_e_transporte_sem_tls(self):
        for alteracao in (
            {"SMTP_USER": "usuario-ficticio", "SMTP_PASSWORD": ""},
            {"SMTP_USER": "", "SMTP_PASSWORD": "senha-ficticia"},
            {"SMTP_SECURITY": "plain"},
            {"SMTP_HOST": ""},
        ):
            with self.subTest(alteracao=alteracao), patch.dict(os.environ, alteracao):
                with self.assertRaises(RuntimeError):
                    emails.validar_configuracao()

    def smtp_falso(self):
        smtp = MagicMock()
        smtp.__enter__.return_value = smtp
        smtp.send_message.return_value = {}
        return smtp

    def test_smtp_starttls_montagem_e_id_estavel(self):
        smtp = self.smtp_falso()
        with patch.dict(os.environ, {"SMTP_USER": "", "SMTP_PASSWORD": "", "SMTP_PORT": "587"}):
            with patch.object(emails.smtplib, "SMTP", return_value=smtp) as conectar:
                emails.enviar(self.aviso)
        conectar.assert_called_once_with("smtp.example.invalid", 587, timeout=20)
        smtp.starttls.assert_called_once()
        smtp.login.assert_not_called()
        mensagem = smtp.send_message.call_args.args[0]
        self.assertEqual(mensagem["To"], self.aviso["destinatario"])
        self.assertEqual(mensagem["Message-ID"], "<faceclass-presenca-71@example.invalid>")

    def test_smtp_ssl_nao_chama_starttls(self):
        smtp = self.smtp_falso()
        with patch.dict(os.environ, {"SMTP_SECURITY": "ssl", "SMTP_PORT": "465"}):
            with patch.object(emails.smtplib, "SMTP_SSL", return_value=smtp):
                emails.enviar(self.aviso)
        smtp.starttls.assert_not_called()
        smtp.send_message.assert_called_once()

    def test_smtp_destinatario_recusado_nao_conta_como_sucesso(self):
        smtp = self.smtp_falso()
        smtp.send_message.return_value = {"responsavel@example.invalid": (550, b"rejected")}
        with patch.object(emails.smtplib, "SMTP", return_value=smtp):
            with self.assertRaises(RuntimeError):
                emails.enviar(self.aviso)


class Transacoes(Isolado):
    def conexao_falsa(self):
        conexao = MagicMock()
        cursor = MagicMock()
        conexao.cursor.return_value = cursor
        return conexao, cursor

    def test_transacao_confirma_e_fecha(self):
        conexao, cursor = self.conexao_falsa()
        with patch.object(banco, "conectar", return_value=conexao):
            with banco.transacao() as retorno:
                self.assertEqual(retorno, (conexao, cursor))
        conexao.commit.assert_called_once()
        conexao.rollback.assert_not_called()
        cursor.close.assert_called_once()
        conexao.close.assert_called_once()

    def test_transacao_falha_desfaz_e_fecha(self):
        conexao, cursor = self.conexao_falsa()
        with patch.object(banco, "conectar", return_value=conexao):
            with self.assertRaises(RuntimeError):
                with banco.transacao():
                    raise RuntimeError("falha ficticia")
        conexao.commit.assert_not_called()
        conexao.rollback.assert_called_once()
        cursor.close.assert_called_once()
        conexao.close.assert_called_once()

    def test_falha_da_fila_desfaz_a_presenca(self):
        client = api.app.test_client()
        token = client.get("/sessao").get_json()["csrf_token"]
        with client.session_transaction() as sessao:
            sessao["aluno_id"] = ALUNO["id"]

        snapshot, cursor_snapshot = self.conexao_falsa()
        gravacao, cursor_gravacao = self.conexao_falsa()
        cursor_snapshot.fetchone.return_value = {
            "rosto_template": "template-ficticio", "rosto_modelo": facial.MODELO,
        }
        cursor_gravacao.fetchone.return_value = {
            "nome": ALUNO["nome"], "email_responsavel": ALUNO["email_responsavel"],
            "rosto_template": "template-ficticio",
        }
        cursor_gravacao.fetchall.return_value = []
        cursor_gravacao.lastrowid = 71

        def executar_sql(sql, valores=None):
            if "INSERT INTO notificacao_email" in sql:
                raise RuntimeError("falha ficticia ao gravar fila")

        cursor_gravacao.execute.side_effect = executar_sql
        with patch.object(banco, "conectar", side_effect=[snapshot, gravacao]):
            with patch.object(api, "transacao", banco.transacao):
                with patch.object(api, "conferir", return_value=True), patch.object(
                    api.app.logger, "error"
                ) as log_erro:
                    resposta = client.post(
                        "/presenca",
                        json={"tipo": "entrada", "latitude": 0, "longitude": 0,
                              "precisao": 20, "imagem": "captura-ficticia"},
                        headers={"X-CSRF-Token": token, "Origin": "http://localhost"},
                    )
        self.assertEqual(resposta.status_code, 503)
        log_erro.assert_called_once_with("Falha interna: %s", "RuntimeError")
        snapshot.commit.assert_called_once()
        gravacao.commit.assert_not_called()
        gravacao.rollback.assert_called_once()
        comandos = [chamada.args[0] for chamada in cursor_gravacao.execute.call_args_list]
        self.assertTrue(any("INSERT INTO presenca" in sql for sql in comandos))
        self.assertTrue(any("INSERT INTO notificacao_email" in sql for sql in comandos))


class TesteEmailLocal(Isolado):
    def test_envia_apenas_ao_proprio_remetente_sem_banco(self):
        with patch.dict(os.environ, {
            "SMTP_HOST": "smtp.example.invalid",
            "SMTP_USER": "teste@example.invalid",
            "SMTP_PASSWORD": "senha-ficticia",
            "SMTP_FROM": "teste@example.invalid",
        }), patch.object(testar_email, "enviar") as enviar_falso, patch("builtins.print"):
            testar_email.main()
        aviso = enviar_falso.call_args.args[0]
        self.assertEqual(aviso["destinatario"], "teste@example.invalid")
        self.assertIn("Nenhuma entrada ou saída", aviso["corpo"])

    def test_recusa_remetente_diferente(self):
        with patch.dict(os.environ, {
            "SMTP_HOST": "smtp.example.invalid",
            "SMTP_USER": "teste@example.invalid",
            "SMTP_PASSWORD": "senha-ficticia",
            "SMTP_FROM": "outro@example.invalid",
        }), patch.object(testar_email, "enviar") as enviar_falso:
            with self.assertRaises(RuntimeError):
                testar_email.main()
        enviar_falso.assert_not_called()


if __name__ == "__main__":
    unittest.main()
