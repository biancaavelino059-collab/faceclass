"use strict";

/* =================================================================
   1. CONFIGURAÇÕES E DADOS GERAIS
   ================================================================= */

// Atalho para pegar elementos da tela pelo ID mais rápido
const porId = (id) => document.getElementById(id);

// Guarda as informações principais do sistema e do aluno logado
const estado = {
    aluno: null,
    csrf: "token-teste",
    historico: [],
    hoje: null,
    historicoCarregado: false,
    sessaoConhecida: true,
    ocupado: false,
    tela: "tela-login",
    acaoFacial: null,
    stream: null,
    cameraVersao: 0,
    cameraPronta: false,
};

let consultaHistorico = null;
let intervaloDeteccao = null;


/* =================================================================
   2. AVISOS E MENSAGENS NA TELA
   ================================================================= */

// Cria um tipo de erro personalizado para o sistema
class ErroRequisicao extends Error {
    constructor(mensagem, status = 0) {
        super(mensagem);
        this.status = status;
    }
}

// Mostra mensagens de erro, sucesso ou aviso na tela para o usuário
function mensagem(id, texto = "", tipo = "erro") {
    const elemento = porId(id);
    if (!elemento) return;
    elemento.textContent = texto;
    elemento.style.color = tipo === "sucesso" ? "var(--success)"
        : tipo === "info" ? "var(--subtext)" : "var(--danger)";
}


/* =================================================================
   3. FORMATAÇÃO, VALIDAÇÃO E DESTAQUE DE ERROS NOS CAMPOS
   ================================================================= */

// Deixa o RA maiúsculo e remove espaços ou traços
function normalizarRA(valor) {
    return String(valor ?? "").replace(/[-\s]/g, "").toUpperCase();
}

function formatarRA(valor) {
    const caracteres = String(valor ?? "")
        .toUpperCase()
        .replace(/[^0-9A-Z]/g, "")
        .slice(0, 14);

    if (caracteres.length <= 13) {
        return caracteres;
    }

    return `${caracteres.slice(0, 13)}-${caracteres.slice(13)}`;
}

// Confere se o RA digitado está no formato correto
function validarRA(valor) {
    const ra = normalizarRA(valor);
    if (!/^[0-9]{13}[0-9A-Z]$/.test(ra)) {
        throw new Error("Informe 13 números e o dígito verificador, que pode ser letra ou número.");
    }
    return ra;
}

// Exige o RA completo (12 números + 1 dígito = 13 números) - usado no login
function validarRACompleto(valor) {
    const ra = normalizarRA(valor);
    if (!/^\d{13}[0-9A-Z]$/.test(ra)) {
        throw new Error(`Preencha o RA completo. Ex.: 1234567890123-4`);
    }
    return ra;
}

// Função para formatar o RA colocando o hífen apenas quando todos os dígitos forem preenchidos
function aplicarMascaraRA(event) {
    let input = event.target;
    let valor = input.value.replace(/\D/g, ""); // Remove tudo que não for número
    
    // Tamanho total do RA completo sem o hífen (13 dígitos: 12 números + 1 dígito)
    const tamanhoMaximo = 13; 

    // Se atingiu o tamanho máximo, aplica o hífen separando o último dígito
    if (valor.length >= tamanhoMaximo) {
        valor = valor.substring(0, tamanhoMaximo); // Garante que não passe do limite
        let corpo = valor.slice(0, -1);
        let digito = valor.slice(-1);
        input.value = corpo + "-" + digito;
    } else {
        // Enquanto estiver digitando e não completar, exibe apenas os números normais sem hífen
        input.value = valor;
    }
}

// Muda o formato da data de ano-mes-dia para dia/mes/ano
function dataBrasileira(data) {
    if (!data) return "";
    const partes = data.split("-");
    return partes.length === 3 ? partes.reverse().join("/") : data;
}

// Deixa o horário bonitinho mostrando apenas horas e minutos (Ex: 08:30)
function horaCurta(hora) {
    if (!hora) return "";
    const partes = String(hora).split(":");
    return partes.length >= 2 ? partes[0].padStart(2, "0") + ":" + partes[1] : String(hora);
}

// Limpa todas as bordas vermelhas dos campos de cadastro
function limparErrosCadastro() {
    const idsCampos = [
        "cadastro-nome", "cadastro-email", "cadastro-ra", "cadastro-senha",
        "responsavel-nome", "responsavel-telefone", "responsavel-email"
    ];
    idsCampos.forEach(id => {
        const campo = porId(id);
        if (campo) campo.style.borderColor = "";
    });
}

// Pinta a borda de um campo específico de vermelho para indicar erro
function destacarErro(id) {
    const campo = porId(id);
    if (campo) campo.style.borderColor = "var(--danger)";
}


/* =================================================================
   4. SIMULAÇÃO DO SERVIDOR (MODO DE TESTE)
   ================================================================= */

// Simula respostas falsas do servidor para o site funcionar sem precisar ligar o Python
async function api(caminho, dados) {
    await new Promise(resolve => setTimeout(resolve, 200)); // Simula um tempinho de espera
    
    if (caminho === "/sessao") {
        return { csrf_token: "token-teste", aluno: estado.aluno };
    }
    if (caminho === "/login") {
        return { 
            csrf_token: "token-teste", 
            aluno: estado.aluno || { id: 999, nome: "Aluno Teste", rosto_cadastrado: true } 
        };
    }
    if (caminho === "/alunos") {
        return { 
            csrf_token: "token-teste", 
            aluno: dados 
        };
    }
    if (caminho === "/recuperar-senha") {
        return {
            csrf_token: "token-teste",
            mensagem: "Link de recuperação enviado."
        };
    }
    if (caminho === "/presencas") {
        const dataHoje = new Date().toISOString().split('T')[0];
        return { hoje: estado.hoje || dataHoje, presencas: estado.historico };
    }
    if (caminho === "/presenca" || caminho === "/rosto") {
        const dataHoje = new Date().toISOString().split('T')[0];
        const horaAtual = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        
        if (dados && dados.tipo) {
            estado.historico.push({
                tipo: dados.tipo,
                data: dataHoje,
                horario: horaAtual,
                motivo_saida: dados.motivo_saida || "",
                notificacao: "enviado"
            });
        }
        return { mensagem: "Operação realizada com sucesso!", notificacao: "enviado" };
    }
    if (caminho === "/logout") {
        return { csrf_token: "token-teste" };
    }
    return { csrf_token: "token-teste" };
}


/* =================================================================
   5. CONTROLO DA CÂMARA E DAS TELAS
   ================================================================= */

// Para o loop de verificação facial quando a câmera fecha
function pararDeteccaoFacial() {
    if (intervaloDeteccao) {
        clearInterval(intervaloDeteccao);
        intervaloDeteccao = null;
    }
}

// Verifica continuamente se há um rosto visível no vídeo da câmera
function iniciarDeteccaoFacial(camera, versao) {
    pararDeteccaoFacial();

    // Usa a API nativa FaceDetector (suportada no Chrome/Edge/Android)
    const temDetectorNativo = "FaceDetector" in window;
    const detector = temDetectorNativo ? new window.FaceDetector({ fastMode: true, maxDetectedFaces: 2 }) : null;

    intervaloDeteccao = setInterval(async () => {
        if (estado.tela !== "tela-facial" || versao !== estado.cameraVersao || !estado.stream) {
            pararDeteccaoFacial();
            return;
        }

        if (camera.readyState < 2) return;

        if (detector) {
            try {
                const rostos = await detector.detect(camera);
                if (rostos.length === 1) {
                    estado.cameraPronta = true;
                    mensagem("mensagem-facial", "Rosto detectado! Clique em Confirmar.", "sucesso");
                } else if (rostos.length > 1) {
                    estado.cameraPronta = false;
                    mensagem("mensagem-facial", "Mais de um rosto detectado. Deixe apenas você na câmera.", "erro");
                } else {
                    estado.cameraPronta = false;
                    mensagem("mensagem-facial", "Nenhum rosto detectado. Posicione seu rosto na câmera.", "info");
                }
            } catch {
                estado.cameraPronta = false;
            }
        } else {
            // Fallback para navegadores sem FaceDetector (ex: Firefox/Safari):
            // exige que o vídeo esteja ativo e com imagem válida
            const foto = capturarFoto();
            estado.cameraPronta = Boolean(foto && foto.length > 1500);
            if (estado.cameraPronta) {
                mensagem("mensagem-facial", "Câmera ativa. Posicione seu rosto e confirme.", "sucesso");
            }
        }

        atualizarBotoes();
    }, 500);
}

// Desliga a câmara e limpa a memória dela
function pararCamera() {
    pararDeteccaoFacial();
    estado.cameraVersao += 1;
    estado.cameraPronta = false;
    if (estado.stream) estado.stream.getTracks().forEach((track) => track.stop());
    estado.stream = null;
    const camera = porId("camera");
    if (camera && camera.srcObject) {
        camera.srcObject.getTracks().forEach((track) => track.stop());
        camera.srcObject = null;
    }
    const canvas = porId("canvas-rosto");
    if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
    }
}

// Mostra apenas a tela que a gente quer e esconde as outras
function mostrarTela(id) {
    if (id !== "tela-facial") pararCamera();
    ["tela-login", "tela-cadastro", "tela-recuperar", "tela-facial", "tela-principal"].forEach((tela) => {
        const el = porId(tela);
        if (el) el.classList.toggle("escondida", tela !== id);
    });
    estado.tela = id;
    atualizarBotoes();
}

// Separa apenas os registos feitos no dia de hoje
function registrosHoje() {
    return estado.historico.filter((registro) => registro.data === estado.hoje);
}


// Verifica se ainda está dentro do horário permitido para entrada
function horarioEntradaPermitido() {
    const agora = new Date();
    const minutosAtuais = agora.getHours() * 60 + agora.getMinutes();

    // Permite registrar até 07h30, inclusive
    return minutosAtuais <= (7 * 60 + 30);
}


// Libera ou bloqueia os botões dependendo do que o aluno está a fazer

function atualizarBotoes() {
    const bloqueado = estado.ocupado;
    ["btn-login", "btn-cadastrar"].forEach((id) => {
        const el = porId(id);
        if (el) el.disabled = bloqueado || !estado.sessaoConhecida;
    });
    ["btn-primeiro-acesso", "btn-voltar-login", "btn-esqueceu-senha",
        "btn-voltar-login-recuperar", "btn-enviar-recuperacao", "btn-atualizar-login",
        "btn-sair", "btn-cancelar-facial", "btn-reabrir-camera",
        "btn-atualizar", "btn-confirmar-saida"].forEach((id) => {
        const el = porId(id);
        if (el) el.disabled = bloqueado;
    });
    const btnFacial = porId("btn-cadastrar-facial");
    if (btnFacial) btnFacial.disabled = bloqueado || !estado.cameraPronta || !estado.stream;
    
    const registros = registrosHoje();
    const entrada = registros.some((registro) => registro.tipo === "entrada");
    const saida = registros.some((registro) => registro.tipo === "saida");
    const indisponivel = bloqueado || !estado.aluno || !estado.historicoCarregado;
    
    const btnEntrada = porId("btn-entrada");
    const btnSaida = porId("btn-saida");

const horarioPermitido = horarioEntradaPermitido();

if (btnEntrada) {
    btnEntrada.disabled = indisponivel || entrada || !horarioPermitido;
}

if (btnSaida) {
    btnSaida.disabled = indisponivel || !entrada || saida;
}

if (!horarioPermitido && !entrada && estado.aluno) {
    mensagem(
        "mensagem-principal",
        "Horário encerrado! O registro de entrada só é permitido até 07h30.",
        "erro"
    );
}

}

// Executa uma ação na tela mostrando um aviso de "carregando" se precisar
async function executar(idMensagem, acao) {
    if (estado.ocupado) return;
    estado.ocupado = true;
    atualizarBotoes();
    mensagem(idMensagem);
    try {
        await acao();
    } catch (erro) {
        const destino = {
            "tela-login": "mensagem-login",
            "tela-cadastro": "mensagem-cadastro",
            "tela-recuperar": "mensagem-recuperar",
            "tela-facial": "mensagem-facial",
            "tela-principal": "mensagem-principal",
        }[estado.tela] || idMensagem;
        mensagem(destino, erro.message || "Não foi possível concluir. Tente novamente.");
    } finally {
        estado.ocupado = false;
        atualizarBotoes();
    }
}


/* =================================================================
   6. LOGIN, HISTÓRICO E RECONHECIMENTO FACIAL
   ================================================================= */

// Desconecta o aluno e volta para a tela de login
function limparSessao() {
    estado.aluno = null;
    estado.sessaoConhecida = true;
    estado.historico = [];
    estado.hoje = null;
    estado.historicoCarregado = false;
    estado.acaoFacial = null;
    if (porId("login-senha")) porId("login-senha").value = "";
    if (porId("cadastro-senha")) porId("cadastro-senha").value = "";
    mostrarTela("tela-login");
}

// Atualiza o nome do aluno e a lista de entradas/saídas na tela principal
function atualizarStatus() {
    const nomeAluno = porId("nome-aluno");
    if (nomeAluno) nomeAluno.textContent = estado.aluno ? estado.aluno.nome : "Aluno";
    
    const hoje = registrosHoje();
    for (const tipo of ["entrada", "saida"]) {
        const statusEl = porId("status-" + tipo);
        if (statusEl) {
            const registro = hoje.find((item) => item.tipo === tipo);
            statusEl.textContent = !estado.historicoCarregado
                ? "Atualize os registros" : registro
                    ? "Registrada às " + horaCurta(registro.horario) : "Ainda não registrada";
        }
    }
    
    const lista = porId("lista-historico");
    if (!lista) return;
    lista.replaceChildren();
    
    const notificacoes = {
        pendente: "Aviso por e-mail na fila.",
        enviando: "Aviso por e-mail em processamento.",
        enviado: "Aviso aceito pelo servidor de e-mail.",
        falhou: "Não foi possível enviar o aviso por e-mail. Avise a equipe.",
    };
    
    if (!estado.historicoCarregado || !estado.historico.length) {
        const item = document.createElement("p");
        item.textContent = estado.historicoCarregado
            ? "Nenhum registro realizado." : "Não foi possível carregar os registros. Clique em Atualizar.";
        lista.appendChild(item);
    } else {
        estado.historico.forEach((registro) => {
            const item = document.createElement("p");
            item.className = "historico-item";
            const tipo = registro.tipo === "entrada" ? "Entrada" : "Saída";
            let texto = tipo + " registrada em " + dataBrasileira(registro.data)
                + " às " + horaCurta(registro.horario) + ".";
            if (registro.motivo_saida) texto += " Motivo: " + registro.motivo_saida + ".";
            if (notificacoes[registro.notificacao]) texto += " " + notificacoes[registro.notificacao];
            item.textContent = texto;
            lista.appendChild(item);
        });
    }
    atualizarBotoes();
}

// Puxa do servidor o histórico de dias anteriores do aluno
async function carregarHistorico() {
    if (!estado.aluno) return;
    if (consultaHistorico) return consultaHistorico;
    const alunoId = estado.aluno.id;
    consultaHistorico = (async () => {
        try {
            const retorno = await api("/presencas");
            estado.historico = retorno.presencas;
            estado.hoje = retorno.hoje;
            estado.historicoCarregado = true;
        } catch (erro) {
            if (estado.aluno && estado.aluno.id === alunoId) estado.historicoCarregado = false;
            throw erro;
        } finally {
            if (estado.aluno && estado.aluno.id === alunoId) atualizarStatus();
        }
    })();
    try {
        await consultaHistorico;
    } finally {
        consultaHistorico = null;
    }
}

// Vai para a tela principal ou pede o cadastro do rosto se não tiver
async function irParaConta() {
    if (!estado.aluno.rosto_cadastrado) {
        await prepararFacial("cadastro");
        return;
    }
    mostrarTela("tela-principal");
    await carregarHistorico();
}

// Liga a câmara do telemóvel ou computador (obrigatória para confirmar presença)
async function abrirCamera() {
    pararCamera();
    const versao = estado.cameraVersao;
    mensagem("mensagem-facial", "Abrindo a câmera...", "info");
    atualizarBotoes();
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false,
        });
        if (estado.tela !== "tela-facial" || versao !== estado.cameraVersao) {
            stream.getTracks().forEach((track) => track.stop());
            return;
        }
        estado.stream = stream;
        const camera = porId("camera");
        if (!camera) return;
        camera.srcObject = stream;
        await camera.play();

        mensagem("mensagem-facial", "Procurando rosto na câmera...", "info");
        iniciarDeteccaoFacial(camera, versao);
    } catch {
        if (versao !== estado.cameraVersao) return;
        pararCamera();
        estado.cameraPronta = false;
        mensagem(
            "mensagem-facial",
            "Não foi possível acessar a câmera. Permita o uso da câmera para registrar presença.",
            "erro"
        );
    } finally {
        atualizarBotoes();
    }
}

// Prepara a tela de reconhecimento facial (para entrar, sair ou cadastrar)
async function prepararFacial(tipo, motivo = "") {
    estado.acaoFacial = { tipo, motivo };
    const tituloFacial = porId("titulo-facial");
    const subtituloFacial = porId("subtitulo-facial");
    const btnCadastrarFacial = porId("btn-cadastrar-facial");
    const btnCancelarFacial = porId("btn-cancelar-facial");

    if (tituloFacial) tituloFacial.textContent = tipo === "cadastro" ? "Cadastro facial" : "Confirmar " + tipo;
    if (subtituloFacial) subtituloFacial.textContent = "Posicione seu rosto de frente para a câmera.";
    if (btnCadastrarFacial) btnCadastrarFacial.textContent = "Confirmar";
    if (btnCancelarFacial) btnCancelarFacial.textContent = "Cancelar";
    
    mostrarTela("tela-facial");
    void abrirCamera();
}

// Captura o quadro atual real da câmera no canvas
function capturarFoto() {
    const camera = porId("camera");
    const canvas = porId("canvas-rosto");
    if (!camera || !canvas || !camera.videoWidth || !camera.videoHeight) return null;

    canvas.width = camera.videoWidth;
    canvas.height = camera.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(camera, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
}

// Pega a localização do GPS (simulada para testes)
async function localizar() {
    return { latitude: 0, longitude: 0, precisao: 1 };
}

// Sai da conta do aluno
async function sair() {
    pararCamera();
    limparSessao();
    mensagem("mensagem-login", "Você saiu da conta.", "info");
}

for (const id of ["login-ra", "cadastro-ra"]) {
    porId(id).addEventListener("input", (evento) => {
        evento.target.value = formatarRA(evento.target.value);
    });
}

// Botão de ir para a tela de criar conta (Primeiro acesso)
const btnPrimeiroAcesso = porId("btn-primeiro-acesso");
if (btnPrimeiroAcesso) {
    btnPrimeiroAcesso.addEventListener("click", () => {
        const cadRa = porId("cadastro-ra");
        const logRa = porId("login-ra");
        const cadSenha = porId("cadastro-senha");
        if (cadRa && logRa) {
            cadRa.value = logRa.value;
            cadRa.dispatchEvent(new Event("input"));
        }
        if (cadSenha) cadSenha.value = "";
        limparErrosCadastro();
        mensagem("mensagem-cadastro");
        mostrarTela("tela-cadastro");
    });
}

// Botão de voltar para a tela de login a partir do cadastro
const btnVoltarLogin = porId("btn-voltar-login");
if (btnVoltarLogin) {
    btnVoltarLogin.addEventListener("click", () => {
        const cadSenha = porId("cadastro-senha");
        if (cadSenha) cadSenha.value = "";
        limparErrosCadastro();
        mostrarTela("tela-login");
    });
}

// Botão para abrir a tela de recuperar senha
const btnEsqueceuSenha = porId("btn-esqueceu-senha");
if (btnEsqueceuSenha) {
    btnEsqueceuSenha.addEventListener("click", () => {
        const recRa = porId("recuperar-ra");
        const logRa = porId("login-ra");
        const recEmail = porId("recuperar-email");

        if (recRa) {
            recRa.style.borderColor = "";
            recRa.value = logRa ? logRa.value : "";
            recRa.dispatchEvent(new Event("input"));
        }
        if (recEmail) {
            recEmail.style.borderColor = "";
            recEmail.value = "";
        }
        mensagem("mensagem-recuperar");
        mostrarTela("tela-recuperar");
    });
}

// Botão para voltar da recuperação para o login
const btnVoltarLoginRecuperar = porId("btn-voltar-login-recuperar");
if (btnVoltarLoginRecuperar) {
    btnVoltarLoginRecuperar.addEventListener("click", () => {
        mostrarTela("tela-login");
    });
}

// Botão de enviar link de recuperação
const btnEnviarRecuperacao = porId("btn-enviar-recuperacao");
if (btnEnviarRecuperacao) {
    btnEnviarRecuperacao.addEventListener("click", () => {
        void executar("mensagem-recuperar", async () => {
            const campoRa = porId("recuperar-ra");
            const campoEmail = porId("recuperar-email");
            if (campoRa) campoRa.style.borderColor = "";
            if (campoEmail) campoEmail.style.borderColor = "";

            const raInput = campoRa ? campoRa.value : "";
            const email = campoEmail ? campoEmail.value.trim() : "";

            try {
                validarRA(raInput);
            } catch (erroRa) {
                destacarErro("recuperar-ra");
                throw erroRa;
            }

            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                destacarErro("recuperar-email");
                throw new Error("Informe um e-mail válido.");
            }

            await api("/recuperar-senha", { RA: normalizarRA(raInput), email });
            mensagem(
                "mensagem-recuperar",
                "Se os dados estiverem corretos, enviamos um link de redefinição para o seu e-mail.",
                "sucesso"
            );
        });
    });
}

// Botão de fazer login (exige RA válido e senha preenchida)
const btnLogin = porId("btn-login");
if (btnLogin) {
    btnLogin.addEventListener("click", () => {
        void executar("mensagem-login", async () => {
            // Limpa marcações vermelhas de tentativas anteriores
            ["login-ra", "login-senha"].forEach((id) => {
                const campo = porId(id);
                if (campo) campo.style.borderColor = "";
            });

            const raInput = porId("login-ra") ? porId("login-ra").value : "";
            const senha = porId("login-senha") ? porId("login-senha").value : "";

            try {
                validarRACompleto(raInput);
            } catch (erroRa) {
                destacarErro("login-ra");
                throw erroRa;
            }
            if (!senha) {
                destacarErro("login-senha");
                throw new Error("Digite sua senha.");
            }

            estado.aluno = { id: 999, nome: "Aluno Teste", rosto_cadastrado: true };
            await irParaConta();
        });
    });
}

// Botão de criar conta com validação que pinta de vermelho os campos incorretos
const btnCadastrar = porId("btn-cadastrar");
if (btnCadastrar) {
    btnCadastrar.addEventListener("click", () => {
        void executar("mensagem-cadastro", async () => {
            limparErrosCadastro(); // Limpa marcações vermelhas anteriores

            // Pega os valores preenchidos nos inputs
            const nome = porId("cadastro-nome") ? porId("cadastro-nome").value.trim() : "";
            const email = porId("cadastro-email") ? porId("cadastro-email").value.trim() : "";
            const raInput = porId("cadastro-ra") ? porId("cadastro-ra").value : "";
            const senha = porId("cadastro-senha") ? porId("cadastro-senha").value : "";
            const nomeResp = porId("responsavel-nome") ? porId("responsavel-nome").value.trim() : "";
            const telResp = porId("responsavel-telefone") ? porId("responsavel-telefone").value.replace(/\D/g, "") : "";
            const emailResp = porId("responsavel-email") ? porId("responsavel-email").value.trim() : "";

            // Validações que destacam o campo exato em vermelho se falhar
            // Nome completo obrigatório: pelo menos nome + sobrenome (2 palavras com 2+ letras)
            const partesNome = nome.split(/\s+/).filter(p => p.length >= 2);
            if (!nome || partesNome.length < 2) {
                destacarErro("cadastro-nome");
                throw new Error("Preencha o nome completo (nome e sobrenome).");
            }
            // E-mail obrigatório e só aceita Gmail ou Hotmail
            if (!email || !/^[^\s@]+@(gmail\.com|hotmail\.com|hotmail\.com\.br)$/i.test(email)) {
                destacarErro("cadastro-email");
                throw new Error("Use um e-mail @gmail.com ou @hotmail.com.");
            }
            try {
                validarRA(raInput);
            } catch (erroRa) {
                destacarErro("cadastro-ra");
                throw erroRa;
            }
            if (!nomeResp || nomeResp.length < 3) {
                destacarErro("responsavel-nome");
                throw new Error("Preencha o nome do responsável.");
            }
            if (!telResp || !/^\d{10,11}$/.test(telResp)) {
                destacarErro("responsavel-telefone");
                throw new Error("Informe o telefone do responsável com DDD (10 ou 11 dígitos).");
            }
            if (!emailResp || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailResp)) {
                destacarErro("responsavel-email");
                throw new Error("Preencha um e-mail válido para o responsável.");
            }
            if (!senha || senha.trim().length < 8 || senha.length > 128) {
                destacarErro("cadastro-senha");
                throw new Error("A senha precisa ter entre 8 e 128 caracteres.");
            }

            // Se tudo estiver certo, envia os dados
            const dados = { nome, email, RA: normalizarRA(raInput), senha, nome_responsavel: nomeResp, telefone_responsavel: telResp, email_responsavel: emailResp };
            const retorno = await api("/alunos", dados);
            
            if (!retorno.aluno) throw new Error("Não foi possível concluir o cadastro.");
            
            estado.aluno = { id: 999, nome: dados.nome, rosto_cadastrado: false };
            if (porId("cadastro-senha")) porId("cadastro-senha").value = "";
            limparErrosCadastro();
            
            await irParaConta();
        });
    });
}

// Botão de registrar entrada
const btnEntrada = porId("btn-entrada");
if (btnEntrada) {
    btnEntrada.addEventListener("click", () => {
        void executar("mensagem-principal", async () => {
            
if (!horarioEntradaPermitido()) {
    throw new Error(
        "Horário encerrado! Não é mais possível registrar entrada após 07h30."
    );
}

await carregarHistorico();

if (!horarioEntradaPermitido()) {
    throw new Error(
        "O horário de registro terminou. O limite é 07h30."
    );
}

await prepararFacial("entrada");
        });
    });
}

// Botão de registrar saída (abre o campo para digitar o motivo)
const btnSaida = porId("btn-saida");
if (btnSaida) {
    btnSaida.addEventListener("click", () => {
        void executar("mensagem-principal", async () => {
            await carregarHistorico();
            const campoMotivo = porId("campo-motivo-saida");
            if (campoMotivo) campoMotivo.classList.remove("escondida");
            mensagem("mensagem-principal", "Informe o motivo e confirme a saída.", "info");
        });
    });
}

// Confirma a saída antecipada
const btnConfirmarSaida = porId("btn-confirmar-saida");
if (btnConfirmarSaida) {
    btnConfirmarSaida.addEventListener("click", () => {
        const motivoInput = porId("motivo-saida");
        const motivo = motivoInput ? motivoInput.value.trim() : "";
        void prepararFacial("saida", motivo);
    });
}

// Botão para reabrir a câmera caso tenha falhado
const btnReabrirCamera = porId("btn-reabrir-camera");
if (btnReabrirCamera) {
    btnReabrirCamera.addEventListener("click", () => {
        void abrirCamera();
    });
}

// Botão para confirmar o reconhecimento facial (exige rosto na câmera)
const btnCadastrarFacial = porId("btn-cadastrar-facial");
if (btnCadastrarFacial) {
    btnCadastrarFacial.addEventListener("click", () => {
        void executar("mensagem-facial", async () => {
            if (!estado.stream || !estado.cameraPronta) {
                throw new Error("É obrigatório posicionar um rosto na câmera para confirmar.");
            }

            const foto = capturarFoto();
            if (!foto) {
                throw new Error("Não foi possível capturar a imagem do seu rosto.");
            }

            
if (
    estado.acaoFacial?.tipo === "entrada" &&
    !horarioEntradaPermitido()
) {
    throw new Error(
        "Horário encerrado! A entrada deveria ter sido registrada até 07h30."
    );
}


            const acao = estado.acaoFacial || { tipo: "entrada" };
            const rota = acao.tipo === "cadastro" ? "/rosto" : "/presenca";
            await api(rota, { tipo: acao.tipo, motivo_saida: acao.motivo || "", foto });

            if (acao.tipo === "cadastro" && estado.aluno) {
                estado.aluno.rosto_cadastrado = true;
            }

            mostrarTela("tela-principal");
            const campoMotivo = porId("campo-motivo-saida");
            if (campoMotivo) campoMotivo.classList.add("escondida");
            await carregarHistorico();
            mensagem("mensagem-principal", "Ação registrada com sucesso!", "sucesso");
        });
    });
}

// Botão para cancelar a tela da câmara
const btnCancelarFacial = porId("btn-cancelar-facial");
if (btnCancelarFacial) {
    btnCancelarFacial.addEventListener("click", () => {
        mostrarTela("tela-principal");
        estado.acaoFacial = null;
    });
}

// Botão de sair da conta
const btnSair = porId("btn-sair");
if (btnSair) btnSair.addEventListener("click", () => { void executar("mensagem-principal", sair); });

// Botão para atualizar a lista de registros manualmente
const btnAtualizar = porId("btn-atualizar");
if (btnAtualizar) {
    btnAtualizar.addEventListener("click", () => {
        void executar("mensagem-principal", async () => {
            await carregarHistorico();
            mensagem("mensagem-principal", "Registros atualizados.", "sucesso");
        });
    });
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                ⚠️ ⚠️ o codigo a baixo é responsável por separar o digito do RA / serara o DDD do telefone ⚠️ ⚠️
//                                                POR FAVOR, N MEXER SEM AUTORIZACAO
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Função para aplicar a máscara de RA dinamicamente
function aplicarMascaraRA(event) {
    let input = event.target;
    let valor = input.value.toUpperCase().replace(/[^0-9A-Z]/g, ""); 
    
    const tamanhoMaximo = 13; 

    if (valor.length > tamanhoMaximo) {
        let corpo = valor.substring(0, tamanhoMaximo);
        let digito = valor.substring(tamanhoMaximo, tamanhoMaximo + 1);
        input.value = corpo + "-" + digito;
    } else {
        input.value = valor;
    }
}

// Lista com o ID de todos os campos de RA do seu sistema e aplicação da máscara
const idsCamposRA = ["login-ra", "cadastro-ra", "recuperar-ra",];

idsCamposRA.forEach((id) => {
    const campo = porId(id);
    if (campo) {
        campo.addEventListener("input", aplicarMascaraRA);
    }
});

// Função para formatar o telefone com DDD entre parênteses e o hífen
function aplicarMascaraTelefone(event) {
    let input = event.target;
    let valor = input.value.replace(/\D/g, ""); // Remove tudo que não for número
    
    // Limita a 11 dígitos no total (2 do DDD + 9 do número)
    if (valor.length > 11) {
        valor = valor.substring(0, 11);
    }

    // Aplica a formatação dinamicamente conforme o utilizador digita
    if (valor.length > 7) {
        // Exemplo: (11) 91234-567
        let ddd = valor.substring(0, 2);
        let parte1 = valor.substring(2, 7);
        let parte2 = valor.substring(7, 11);
        input.value = `(${ddd}) ${parte1}-${parte2}`;
    } else if (valor.length > 2) {
        // Exemplo: (11) 9123
        let ddd = valor.substring(0, 2);
        let parte1 = valor.substring(2);
        input.value = `(${ddd}) ${parte1}`;
    } else if (valor.length > 0) {
        // Exemplo: (11
        input.value = `(${valor}`;
    } else {
        input.value = "";
    }
}

// Lista com o ID de todos os campos de telefone do seu sistema
const idsCamposTelefone = ["responsavel-telefone"]; // Adicione mais IDs aqui se tiver outros campos de telefone

idsCamposTelefone.forEach((id) => {
    const campo = porId(id);
    if (campo) {
        campo.addEventListener("input", aplicarMascaraTelefone);
    }
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//       ⚠️ ⚠️ O CODIGO ACIMA É RESPONSÁVEL POR SEPARAR O DIGITO DO RA E O DDD DO TELEFONE, NAO MEXER SEM AUTORIZACAO ⚠️ ⚠️
//                  
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////



// Botão de Pular Tela (Modo Teste / Aluno Teste)
const btnAtalhoTeste = porId("btn-atalho-teste");
if (btnAtalhoTeste) {
    btnAtalhoTeste.addEventListener("click", () => {
        void executar("mensagem-login", async () => {
            // Define um aluno de teste fictício para liberar a interface
            estado.aluno = { id: 999, nome: "Aluno Teste (Atalho)", rosto_cadastrado: true };
            await irParaConta();
        });
    });
}




/* =================================================================
   8. LIGAR O SISTEMA
   ================================================================= */

// Executado automaticamente assim que a página abre para preparar tudo
void executar("mensagem-login", async () => {
    estado.sessaoConhecida = true;
    estado.historicoCarregado = true;
    atualizarBotoes();
});