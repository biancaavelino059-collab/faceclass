# FaceClass web: como rodar e o que foi implementado

## Como iniciar no PC ou na escola

1. Instale Python 3.12 de 64 bits com o Python Launcher e MySQL 8+.
2. Execute `preparar-ambiente.cmd` uma vez na pasta do projeto.
3. Execute `configurar-banco.cmd`: informe a conexão do MySQL daquele PC.
   Os valores entre colchetes podem ser mantidos com Enter; a senha fica oculta.
4. Prepare o SQL com a equipe do banco conforme a seção abaixo e confira
   coordenadas, raio e horário da escola no `.env` local.
5. Execute `iniciar-site.cmd` e abra http://127.0.0.1:5000.

O Gmail pode ser configurado depois. Não é necessário para iniciar o site.
Até lá, as notificações de entrada e saída ficam pendentes no banco.
Para testes, use apenas e-mails destinatários que você controla: ao iniciar
o processador mais tarde, ele enviará os avisos pendentes também.

Use Primeiro acesso para criar uma conta de teste. Não existem credenciais
universais de aluno/professor. O projeto atual é web para registro do aluno
e aviso ao responsável.

O script cria `.venv-web`, instala `requirements.lock.txt`, baixa os dois modelos
e verifica os hashes. Cria `.env` somente se ausente, com chaves aleatórias
persistentes. Não sobrescreve configuração existente nem modifica o MySQL.

O assistente `configurar-banco.cmd` testa o acesso antes de salvar as credenciais
no `.env`. Se o MySQL recusar o usuário/senha, ele preserva os valores anteriores.
O assistente não altera usuários, permissões, senhas ou dados do MySQL.
O `.env` local tem prioridade sobre valores antigos do terminal e as senhas
são lidas literalmente. Depois de salvar, reabra a janela do site para carregar
a nova configuração. Em servidor sem `.env`, são usadas as variáveis de ambiente.

É possível testar senha vazia apertando Enter na pergunta da senha, mas o
servidor precisa ter uma conta já configurada sem senha. Apagar a senha do
`.env` não remove a senha da conta MySQL. O código aceita `@` diretamente,
sem transformar em `%40`.

A base e as chaves não são automaticamente transferidas pelo Git:
restaurar uma base com templates exige também a chave facial correspondente,
transportada de forma segura, fora do repositório.

## Preparar o banco
Pare API/worker antes da migração. Faça backup em arquivo fora do Git.

- Base existente: abra `banco-de-dados/migracoes/001_backend_web.sql` no Workbench
  e execute o arquivo inteiro com uma conta autorizada.
- Instalação nova, sem a base faceclass: use `banco-de-dados/banco-de-dados.sql`.
- Não execute o script de instalação nova para substituir dados existentes.
- Se a migração acusar duplicatas/estrutura incompatível, pare e revise com a
  pessoa do banco. DDL MySQL faz commits implícitos; backup é indispensável.

Depois, para converter senhas antigas em texto, no PowerShell da raiz:

```powershell
cd banco-de-dados
..\.venv-web\Scripts\python.exe -m flask --app app migrar-senhas
cd ..
```

O comando preserva a senha atual, mas armazena hash. Senhas antigas curtas ainda
precisam ser trocadas antes de uso real.

## O que cada arquivo faz
- `index.html`: estrutura da interface e controles de cadastro/câmera/histórico.
- `front-end/script.js`: consulta API, gerencia sessão/CSRF, captura foto nova,
  pede localização e apresenta histórico e situação do aviso. Não usa cadastros
  falsos/localStorage como banco.
- `front-end/style.css`: visual original com complementos para novos controles.
- `banco-de-dados/app.py`: serve o site e implementa sessão, cadastro, login,
  rosto, presença e histórico privado. Valida dados, GPS, rosto e regras no servidor.
- `banco-de-dados/banco.py`: lê `.env` e abre transações MySQL, com commit ou rollback.
- `banco-de-dados/facial.py`: YuNet detecta rosto, SFace extrai vetor; Fernet
  criptografa o template. Comparação usa uma captura nova a cada registro.
- `banco-de-dados/emails.py`: presença gera aviso na mesma transação. Worker
  reserva por token e envia por SMTP/TLS, com até cinco tentativas.
- `banco-de-dados/configurar.py`: verifica/baixa modelos e prepara configuração
  sem trocar chaves existentes. Não acessa dados de alunos.
- `banco-de-dados/configurar_banco.py` e `configurar-banco.cmd`: assistente
  para informar e testar a conexão MySQL sem editar o `.env` manualmente.
- `banco-de-dados/verificar.py`: verifica configuração, conexão, tipos, índices
  únicos e vínculos das tabelas, sem mostrar senhas ou dados de alunos.
  Diagnóstico manual, na pasta banco-de-dados:
  `..\.venv-web\Scripts\python.exe verificar.py`.
- `banco-de-dados/testar_email.py` e `testar-email.cmd`: enviam um único
  e-mail de teste para o próprio remetente, sem registrar presença ou usar MySQL.
- `banco-de-dados/tests/`: testes locais fictícios, sem MySQL/SMTP/rede reais.
- `requirements.txt`: dependências por faixa; `requirements.lock.txt`: versões
  exatas testadas no Windows/Python 3.12.
- `.gitignore`: protege configuração local, ambientes, modelos e caches.

O MySQL é acessado por parâmetros separados; senha com @ não precisa ser
codificada como URL. A senha antiga exposta no código versionado deve ser trocada.
Use credenciais da aplicação com permissões limitadas para uso real.

## Gmail inicialmente
O host já foi configurado como smtp.gmail.com, porta 587 e STARTTLS.
Quando for ativar o e-mail, preencha SMTP_USER e SMTP_FROM com o Gmail remetente
e SMTP_PASSWORD com a senha de aplicativo dessa conta no `.env` local.
Não use a senha normal da conta, não a envie no chat e não a coloque no Git.

A senha de aplicativo exige verificação em duas etapas e pode não estar
disponível em alguns tipos de conta. Se a opção não existir, não desative
proteções: será necessário escolher outro fluxo de autenticação/provedor.
[Instruções oficiais do Google](https://support.google.com/accounts/answer/185833?hl=pt-BR).
[Parâmetros SMTP do Gmail](https://support.google.com/mail/answer/7104828?hl=pt-BR).

O código aceita outro serviço depois: alterar SMTP_HOST/PORT/SECURITY/USER/
PASSWORD/FROM no .env, sem trocar a lógica de fila.

Depois de configurar, execute `testar-email.cmd` para mandar uma única mensagem
ao próprio remetente. Confira a caixa de entrada e o spam; então execute
`iniciar-emails.cmd` para processar a fila de avisos.

## API
Página e API precisam ficar na mesma origem. Não use Live Server nem file://.

| Método | Rota | Função |
| --- | --- | --- |
| GET | /sessao | Aluno atual ou null + csrf_token |
| POST | /alunos | Cadastro e início de sessão |
| POST | /login | RA/senha e sessão |
| POST | /logout | Encerrar sessão |
| POST | /rosto | Template facial autenticado |
| POST | /presenca | Entrada/saída com imagem e localização novas |
| GET | /presencas | Histórico do próprio aluno |
| GET | /teste-banco | Diagnóstico de conexão |

Todos os POST usam JSON, cookies da sessão e X-CSRF-Token. Senha e template
não são retornados no perfil. O aluno vem da sessão, não de um ID enviado pelo front.
Regra atual: uma entrada e uma saída por dia, com motivo na saída antecipada.

## Testar
Na raiz do projeto, no PowerShell:

```powershell
cd banco-de-dados
..\.venv-web\Scripts\python.exe -m unittest discover -s tests -v
```

Pelo site, criar conta fictícia com e-mail de teste que você controla:
cadastro -> rosto -> entrada -> histórico -> saída -> histórico -> logout/login.
Conferir rosto diferente rejeitado e registro duplicado bloqueado.

Sem SMTP, os avisos ficam pendentes. Com worker/SMTP, conferir caixa de entrada
e spam. Estado enviado significa aceitação pelo SMTP, não comprovação de entrega.
Uma interrupção após envio e antes do UPDATE pode gerar aviso duplicado.

## O que foi realmente verificado
- 64 testes automatizados do backend e da estrutura do banco, sem MySQL/SMTP/rede/fotos reais.
- 14 cenários isolados de front, com API/DOM/câmera simulados.
- 34 verificações de modelos/formatos/Fernet/matemática facial, sem fotos de pessoas.
- 44 verificações de API com MySQL 8.0.46 em instância isolada, dados fictícios:
  cadastro/login/sessão/CSRF/histórico/duplicações/filas/rollback/migração de senhas.
  A decisão facial positiva foi simulada nesses testes de API, não uma identificação real.
- Instalação consistente das dependências (pip check) e sintaxe dos Python.
- O schema e migração SQL também foram testados anteriormente em base isolada.

Esses testes não comprovam a conexão com o MySQL de outro computador,
reconhecimento do rosto do usuário nem entrega real de e-mail. Cada computador
precisa da sua configuração local e do teste de ponta a ponta.

## Limites antes de usar com alunos reais
É desenvolvimento local, não servidor público de produção. Câmera em outro
aparelho requer HTTPS; localhost vale apenas no próprio aparelho.
Foto/vídeo pode ser usado em tentativa de fraude: não há prova de vivacidade.
GPS é manipulável. O limiar facial 0.5 é experimental, não 50% de certeza.
Revisar cadastro inicial, consentimento/proteção/retenção dos dados, recuperação
de conta, limitação de tentativas, HTTPS e configuração de produção.
