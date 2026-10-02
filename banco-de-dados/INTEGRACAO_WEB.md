# Integração web do FaceClass

## Divisão do trabalho

Kauê cuida do backend Python. A pedido dele, a API abaixo foi implementada
nos arquivos do projeto. O front e SQL seguem esse contrato.

Foram implementados app.py, banco.py, facial.py e emails.py, configuração,
diagnóstico, scripts de inicialização e testes. O ambiente funcional é .venv-web.
Não foi executada a migração no MySQL instalado, não foi enviado e-mail real
e não houve commit/push. Veja ../README_WEB.md para o roteiro atualizado.

## O que foi ajustado e por quê

- index.html: preservado o caminho corrigido do JavaScript; primeiro acesso
  agora abre o cadastro real, sem aluno de teste. Acrescentados voltar,
  atualizar, cancelar e reabrir câmera, usando o mesmo visual.
- front-end/script.js: substituído o armazenamento de cadastro/senhas/fotos/
  presenças em localStorage por chamadas à API. Os registros exibidos vêm do
  banco através do backend, não de um cadastro local fictício.
- Login/cadastro: RA aceita letras e números, normalizados para maiúsculas,
  removendo espaços e hífens. Cadastro exige senha de 8 a 128 caracteres,
  conforme o backend combinado. Senhas não são guardadas pelo JavaScript.
- Câmera: a mesma tela serve para cadastrar o rosto e confirmar cada entrada/
  saída com uma foto nova. Tracks são encerrados ao sair, cancelar, ocultar
  a página ou concluir a ação. O canvas técnico fica oculto e é limpo.
- Localização: envia latitude, longitude e precisão. A escola, o raio e o
  horário são validados pelo servidor, não por constantes do JavaScript.
- Histórico/status: a data de hoje vem da API; um registro de ontem não bloqueia
  o dia seguinte. Há atualização manual, ao voltar à página e a cada minuto.
- Erros: botão ocupado fica bloqueado, mensagens aparecem na tela correta e
  timeout de presença reconsulta o histórico, sem repetir POST automaticamente.
- E-mail: distingue fila, processamento, falha e aceitação pelo SMTP. Não promete
  que uma mensagem pendente já chegou na caixa do responsável.
- style.css: apenas complementos para controles, textarea e histórico; mantidas
  cores, classes e estrutura visual do front original.
- SQL: campo de senha ampliado para hash, telefone como texto, um mesmo contato
  responsável permitido para irmãos, campos de template facial criptografado,
  motivo da saída e fila de notificações.

A regra mantida do protótipo é **uma entrada e uma saída por aluno por dia**.
Se o grupo quiser permitir várias saídas e retornos, deve combinar outro
contrato e outra regra de banco antes de remover a restrição.

Dados locais antigos não são importados automaticamente: não são cadastros
confirmados pelo servidor. Nenhuma chave de localStorage foi apagada por esta
alteração, mas o sistema novo não consulta nem grava aqueles dados.

## Implementação do backend

Os arquivos implementados fazem:

1. banco.py: configuração pelo .env e transação.
2. app.py: sessão, senha com hash, CSRF, cadastro, rosto,
   presença, histórico e servir o front.
3. facial.py: detecção e comparação de rosto com template criptografado.
4. emails.py: fila/worker de envio com tentativa e reserva.
5. requirements.txt, requirements.lock.txt, .env.example e configurar.py:
   instalação e configuração local. Credenciais SMTP ainda precisam ser preenchidas.

Os quatro arquivos Python já foram criados/editados e conferidos contra o contrato.
A integração foi testada em MySQL isolado, não na base instalada do usuário.
Não retorne SELECT * de aluno no backend: senha e template facial não devem
ser enviados ao navegador. A senha do MySQL já publicada no código antigo
precisa ser trocada; segredos devem ficar no .env, fora do Git.

## Contrato exato esperado pelo front

Servir a página e a API na **mesma origem**, por exemplo:

- Página: http://127.0.0.1:5000/
- Arquivos estáticos: /front-end/style.css e /front-end/script.js
- API: os caminhos da tabela abaixo.

Não abrir index.html como arquivo nem usar Live Server separado nesta etapa.
Hospedar front e API em serviços diferentes exige planejar CORS/cookies/CSRF;
não está implementado aqui.

| Método | Caminho | Função |
| --- | --- | --- |
| GET | /sessao | Sessão atual e token CSRF, inclusive antes de entrar |
| POST | /alunos | Cadastro com os dados do aluno e responsável; inicia sessão |
| POST | /login | Entrar com RA e senha |
| POST | /logout | Encerrar sessão |
| POST | /rosto | Cadastro facial autenticado |
| POST | /presenca | Entrada/saída autenticada com nova foto e localização |
| GET | /presencas | Histórico somente do aluno da sessão |

Todos os POSTs usam JSON e X-CSRF-Token. O fetch usa cookies same-origin.
Não é preciso token de acesso em localStorage.

GET /sessao retorna:

    {
      "aluno": null,
      "csrf_token": "token-da-sessao"
    }

Após login/cadastro, aluno deve ter esta estrutura:

    {
      "id": 1,
      "nome": "Nome do aluno",
      "RA": "RA_NORMALIZADO",
      "email": "aluno@example.com",
      "rosto_cadastrado": false,
      "responsavel": {
        "nome": "Nome do responsável",
        "email": "responsavel@example.com",
        "telefone": "11999999999"
      }
    }

Esses valores são apenas exemplos de formato, não contas disponíveis.

POST /alunos recebe:

    {
      "nome": "...",
      "RA": "...",
      "email": "...",
      "senha": "...",
      "nome_responsavel": "...",
      "telefone_responsavel": "...",
      "email_responsavel": "..."
    }

POST /login recebe RA e senha. As respostas de /login e /alunos DEVEM incluir
aluno e csrf_token atualizado. /logout também devolve csrf_token para a nova
sessão anônima. O front adota o token de cada resposta.

POST /rosto recebe imagem como data URL JPEG. Só considerar o rosto cadastrado
depois de confirmar a análise e gravar o template no servidor.

POST /presenca recebe:

    {
      "tipo": "entrada",
      "latitude": -23.0,
      "longitude": -46.0,
      "precisao": 15,
      "imagem": "data:image/jpeg;base64,...",
      "motivo_saida": ""
    }

Para saída, tipo é saida. O usuário informa o motivo antes de abrir a câmera;
o backend decide se é obrigatório naquele horário. O front não envia aluno_id
nem validacao_facial: ambos devem ser determinados pelo servidor.

Resposta de presença: mensagem, presenca (id, tipo, data, horario, motivo_saida)
e notificacao com o estado inicial da fila, por exemplo pendente.

GET /presencas retorna:

    {
      "hoje": "2026-10-02",
      "presencas": [
        {
          "id": 1,
          "tipo": "entrada",
          "data": "2026-10-02",
          "horario": "07:10:00",
          "motivo_saida": null,
          "notificacao": "pendente"
        }
      ]
    }

Retorne registros do mais recente para o mais antigo. notificacao aceita
pendente, enviando, enviado, falhou ou null para registros anteriores à fila.
Erros usam JSON com erro e HTTP 400/401/403/409/422/503 conforme o guia.
Um 401 encerra a conta na interface; o usuário pode reconectar e entrar novamente.

## Banco: instalação nova versus migração

### Banco existente

1. Fazer backup da base faceclass no Workbench e guardar o arquivo fora do Git.
2. Parar API e worker durante a migração.
3. Abrir migracoes/001_backend_web.sql e executar o arquivo completo no Workbench
   com uma conta autorizada a alterar tabelas/criar rotinas.
4. Se aparecer erro de duplicatas, estrutura diferente ou vínculo inesperado,
   parar e revisar com a pessoa responsável pelo banco. Não apagar registros
   automaticamente.
5. Conferir DESCRIBE aluno, DESCRIBE presenca e DESCRIBE notificacao_email.
6. Quando o backend novo estiver pronto, executar sua migração de senhas:

       ..\.venv-web\Scripts\python.exe -m flask --app app migrar-senhas

A migração SQL não converte senhas em hash; só aumenta o espaço para armazená-lo.
A conversão controlada é feita pelo comando do backend enviado no chat.
Senhas antigas de quatro caracteres ainda precisam de uma política de troca
para uso real; a migração preserva os valores existentes.

A migração não faz DELETE/DROP de tabelas, não cria usuários com permissões
globais e não agenda e-mails para presenças antigas. Ela verifica duplicatas
e vínculos antes dos ALTERs, descobre nomes reais dos índices de responsáveis
e permite retomar adições já feitas. Campos inesperados exigem revisão.

ALTER TABLE e CREATE TABLE fazem commits implícitos no MySQL: uma falha posterior
não desfaz toda a migração. Backup continua sendo necessário.
Referência: [Manual do MySQL](https://dev.mysql.com/doc/refman/8.0/en/implicit-commit.html).

### Instalação nova

Usar banco-de-dados.sql somente em uma instância sem a base faceclass.
Não executar esse arquivo para substituir uma base existente. O arquivo não
contém mais aluno real de exemplo, contato pessoal nem senha em texto.
Criar contas pelo cadastro da API nova.

## Como abrir depois que o backend estiver implementado

No CMD, dentro da pasta banco-de-dados, com o .env preenchido e o schema pronto:

    ..\.venv-web\Scripts\python.exe -m flask --app app run --host 127.0.0.1 --port 5000

Abrir http://127.0.0.1:5000 no navegador. Em outro terminal, na mesma pasta:

    ..\.venv-web\Scripts\python.exe emails.py

É o fluxo local de desenvolvimento, não servidor de produção.
Permitir câmera/localização no navegador. Para celular remoto, usar HTTPS;
localhost funciona apenas no próprio aparelho.

## Testes e limites

Verificados nesta etapa: sintaxe JavaScript, referências de elementos HTML,
diff sem erros de whitespace e 14 cenários isolados com DOM/API/câmera simulados.

O SQL também foi executado em uma instância temporária de MySQL 8.0.46,
separada do serviço/banco do usuário, com dados fictícios. Foram verificados
schema novo, migração do schema antigo, preservação de alunos/presenças/senhas,
reexecução, contatos compartilhados por irmãos e processamento básico da fila.
Duplicatas, telefone longo e IDs incompatíveis bloquearam a migração antes
de alterar as tabelas. O SQL não foi aplicado ao banco instalado do projeto.

Os cenários cobriram sessão/CSRF, cadastro, login/logout, recuperação da sessão,
data vinda do servidor, fotos distintas em entrada/saída, motivo, cancelamento
de câmera tardia, visibilidade, 401, falha de histórico e timeout após registro.

Ainda precisam ser testados juntos: banco instalado do projeto, API real,
webcam/celular, modelos de reconhecimento e SMTP. Os testes isolados não
confirmam essa integração completa nem o reconhecimento de rostos reais.

Reconhecimento por foto não é Apple Face ID e não inclui prova de vivacidade:
foto/vídeo de outra pessoa ainda é um risco. GPS do navegador não comprova
presença física de forma incontestável. Antes de uso com alunos reais, combinar
consentimento, proteção/retenção dos dados e verificação do cadastro inicial.

## Sugestões de commits após revisar e testar

- fix(front): conecta cadastro e registros com a API
- fix(db): prepara banco para facial e avisos por email
- docs: explica integracao do front com o backend

No corpo, explicar que o front antes guardava dados no navegador, senha tinha
apenas quatro caracteres de espaço no banco e UNIQUE nos contatos impedia irmãos.
Não afirmar que o reconhecimento/email já funcionam se ainda não foram testados.

Revisar git diff antes de adicionar arquivos. Nunca adicionar .env, senhas,
fotos, modelos baixados, backup SQL com dados pessoais ou arquivos de teste
com dados reais. Não publicar as mudanças isoladas com o app.py antigo.
