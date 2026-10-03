"""Testes de metadados fictícios, sem conexão MySQL ou leitura de .env."""
from copy import deepcopy
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
with patch("dotenv.load_dotenv", return_value=False):
    import verificar


def schema_valido():
    tabelas = [{"TABLE_NAME": tabela, "ENGINE": "InnoDB"} for tabela in verificar.CAMPOS]
    colunas = []
    for tabela, nomes in verificar.CAMPOS.items():
        for nome in nomes:
            colunas.append({
                "TABLE_NAME": tabela, "COLUMN_NAME": nome, "DATA_TYPE": "varchar",
                "COLUMN_TYPE": "varchar(500)", "IS_NULLABLE": "NO",
                "CHARACTER_MAXIMUM_LENGTH": 500, "EXTRA": "",
            })
    for linha in colunas:
        if linha["COLUMN_NAME"] in {"id", "aluno_id", "presenca_id"}:
            tipo = "bigint" if linha["TABLE_NAME"] == "notificacao_email" and linha["COLUMN_NAME"] == "id" else "int"
            linha.update(DATA_TYPE=tipo, COLUMN_TYPE=tipo, CHARACTER_MAXIMUM_LENGTH=None,
                         EXTRA="auto_increment" if linha["COLUMN_NAME"] == "id" else "")
        if linha["COLUMN_NAME"] == "rosto_template":
            linha.update(DATA_TYPE="longtext", COLUMN_TYPE="longtext", IS_NULLABLE="YES",
                         CHARACTER_MAXIMUM_LENGTH=4294967295)
    indices = []
    for tabela, nome, campos in (
        ("aluno", "PRIMARY", ("id",)), ("presenca", "PRIMARY", ("id",)),
        ("notificacao_email", "PRIMARY", ("id",)),
        ("aluno", "ra_unico", ("RA",)), ("aluno", "email_unico", ("email",)),
        ("presenca", "diario", ("aluno_id", "data", "tipo")),
        ("notificacao_email", "aviso_unico", ("presenca_id",)),
    ):
        for posicao, campo in enumerate(campos, 1):
            indices.append({"TABLE_NAME": tabela, "INDEX_NAME": nome, "NON_UNIQUE": 0,
                            "SEQ_IN_INDEX": posicao, "COLUMN_NAME": campo, "SUB_PART": None})
    chaves = [
        {"TABLE_NAME": "presenca", "CONSTRAINT_NAME": "fk_aluno", "COLUMN_NAME": "aluno_id",
         "REFERENCED_TABLE_NAME": "aluno", "REFERENCED_COLUMN_NAME": "id", "REFERENCIA_LOCAL": 1},
        {"TABLE_NAME": "notificacao_email", "CONSTRAINT_NAME": "fk_presenca", "COLUMN_NAME": "presenca_id",
         "REFERENCED_TABLE_NAME": "presenca", "REFERENCED_COLUMN_NAME": "id", "REFERENCIA_LOCAL": 1},
    ]
    return [tabelas, colunas, indices, chaves]


class MetadadosMySQL(unittest.TestCase):
    def test_aceita_schema_e_nomes_de_indices_diferentes(self):
        snapshot = schema_valido()
        original = deepcopy(snapshot)
        self.assertEqual(verificar.validar_metadados(*snapshot), [])
        self.assertEqual(snapshot, original)

    def test_aceita_unique_com_mesmas_colunas_em_outra_ordem(self):
        snapshot = schema_valido()
        for linha in snapshot[2]:
            if linha["INDEX_NAME"] == "diario":
                linha["SEQ_IN_INDEX"] = 4 - linha["SEQ_IN_INDEX"]
        self.assertEqual(verificar.validar_metadados(*snapshot), [])

    def test_detecta_tabela_ausente_engine_e_campo_ausente(self):
        for alteracao in ("ausente", "engine", "campo"):
            with self.subTest(alteracao=alteracao):
                snapshot = schema_valido()
                if alteracao == "ausente":
                    snapshot[0].pop()
                elif alteracao == "engine":
                    snapshot[0][0]["ENGINE"] = "MyISAM"
                else:
                    snapshot[1] = [linha for linha in snapshot[1] if linha["COLUMN_NAME"] != "senha"]
                self.assertTrue(verificar.validar_metadados(*snapshot))

    def test_detecta_id_sem_auto_increment_unsigned_ou_nullable(self):
        for campo, valor in (("EXTRA", ""), ("COLUMN_TYPE", "int unsigned"),
                             ("IS_NULLABLE", "YES"), ("DATA_TYPE", "varchar")):
            with self.subTest(campo=campo):
                snapshot = schema_valido()
                linha = next(item for item in snapshot[1]
                             if item["TABLE_NAME"] == "aluno" and item["COLUMN_NAME"] == "id")
                linha[campo] = valor
                self.assertTrue(any("aluno.id" in erro for erro in verificar.validar_metadados(*snapshot)))

    def test_detecta_senha_curta_telefone_numerico_e_template_incorreto(self):
        for nome, campo, valor in (("senha", "CHARACTER_MAXIMUM_LENGTH", 100),
                                  ("telefone_responsavel", "DATA_TYPE", "decimal"),
                                  ("rosto_template", "DATA_TYPE", "text"),
                                  ("rosto_template", "IS_NULLABLE", "NO")):
            with self.subTest(nome=nome, campo=campo):
                snapshot = schema_valido()
                next(item for item in snapshot[1] if item["COLUMN_NAME"] == nome)[campo] = valor
                self.assertTrue(any(f"aluno.{nome}" in erro for erro in verificar.validar_metadados(*snapshot)))

    def test_detecta_primary_e_uniques_ausentes_ou_parciais(self):
        for nome in ("PRIMARY", "ra_unico", "email_unico", "diario", "aviso_unico"):
            with self.subTest(nome=nome):
                snapshot = schema_valido()
                snapshot[2] = [linha for linha in snapshot[2] if linha["INDEX_NAME"] != nome]
                self.assertTrue(verificar.validar_metadados(*snapshot))
        for campo, valor in (("NON_UNIQUE", 1), ("SUB_PART", 10)):
            with self.subTest(campo=campo):
                snapshot = schema_valido()
                next(linha for linha in snapshot[2] if linha["INDEX_NAME"] == "ra_unico")[campo] = valor
                self.assertTrue(any("índice único em RA" in erro for erro in verificar.validar_metadados(*snapshot)))

    def test_detecta_fk_ausente_outro_schema_ou_destino(self):
        for alteracao in ("ausente", "schema", "destino", "composta"):
            with self.subTest(alteracao=alteracao):
                snapshot = schema_valido()
                if alteracao == "ausente":
                    snapshot[3] = []
                elif alteracao == "schema":
                    snapshot[3][0]["REFERENCIA_LOCAL"] = 0
                elif alteracao == "destino":
                    snapshot[3][0]["REFERENCED_TABLE_NAME"] = "outro_aluno"
                else:
                    snapshot[3].append(dict(snapshot[3][0], COLUMN_NAME="outro_campo"))
                self.assertTrue(any("vincular" in erro for erro in verificar.validar_metadados(*snapshot)))

    def test_consulta_somente_information_schema_do_banco_atual(self):
        cursor = MagicMock()
        cursor.fetchall.side_effect = schema_valido()
        self.assertEqual(verificar.verificar_schema(cursor), [])
        self.assertEqual(cursor.execute.call_count, 4)
        for chamada in cursor.execute.call_args_list:
            consulta = chamada.args[0]
            self.assertIn("information_schema.", consulta)
            self.assertIn("TABLE_SCHEMA=DATABASE()", consulta)
            self.assertNotIn("SELECT *", consulta)
            self.assertTrue(consulta.startswith("SELECT "))


if __name__ == "__main__":
    unittest.main()
