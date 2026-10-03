# FaceClass

Protótipo **web** para registrar entrada e saída de alunos com câmera, verificação facial e localização, e avisar o responsável por e-mail. O aplicativo Android antigo não faz parte deste fluxo.

O código do site, da API Flask, do banco MySQL e da fila de e-mails está neste repositório. Para rodar em um computador, ainda é preciso configurar **um MySQL local**, as coordenadas da escola e, para enviar e-mails reais, uma conta SMTP. Senhas e chaves ficam somente no arquivo local `banco-de-dados/.env`, que o Git ignora.

No Windows, execute `preparar-ambiente.cmd` uma vez e `configurar-banco.cmd` para informar a conexão MySQL sem editar o `.env` manualmente. Prepare o SQL com a equipe do banco, inicie `iniciar-site.cmd` e abra `http://127.0.0.1:5000`.

**Gmail pode ficar para depois.** O site guarda os avisos como pendentes enquanto o envio não estiver configurado. Quando configurar SMTP, use `testar-email.cmd` para testar ao próprio remetente e `iniciar-emails.cmd` para processar os avisos pendentes.

O passo a passo do banco, da configuração e dos testes está em [README_WEB.md](README_WEB.md). O contrato técnico entre site, API e banco está em [INTEGRACAO_WEB.md](banco-de-dados/INTEGRACAO_WEB.md).

**Estado atual:** os testes automatizados passam, mas a integração com o MySQL e a entrega real pelo Gmail ainda dependem das credenciais locais. Não use com alunos reais antes de validar câmera, rosto, GPS, e-mail e requisitos de privacidade/segurança.
