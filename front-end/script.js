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
let modoDesenvolvimento = false;
let tokenRecuperacao = new URLSearchParams(
    window.location.hash.slice(1)
).get("redefinir");


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
   2.1 SISTEMA DE COOKIES E TERMOS DE SEGURANÇA
   ================================================================= */

// Cria um cookie com validade em dias e proteção SameSite
function definirCookie(nome, valor, dias = 180) {
    const data = new Date();
    data.setTime(data.getTime() + dias * 24 * 60 * 60 * 1000);
    const expira = "expires=" + data.toUTCString();
    document.cookie = `${nome}=${encodeURIComponent(valor)};${expira};path=/;SameSite=Lax`;
}

// Lê o valor de um cookie específico pelo nome
function lerCookie(nome) {
    const chave = nome + "=";
    const partes = document.cookie.split(";");
    for (let item of partes) {
        item = item.trim();
        if (item.indexOf(chave) === 0) {
            return decodeURIComponent(item.substring(chave.length));
        }
    }
    return null;
}

// Verifica se o usuário já aceitou os cookies; se não, exibe o banner
function verificarConsentimentoCookies() {
    const banner = porId("banner-cookies");
    if (!banner) return;

    const consentimento = lerCookie("controle_escolar_cookies");
    if (consentimento === "aceito") {
        banner.classList.add("escondida");
    } else {
        banner.classList.remove("escondida");
    }
}

// Abre ou fecha o modal de Termos de Segurança
function alternarModalTermos(abrir) {
    const modal = porId("modal-termos");
    if (!modal) return;
    modal.classList.toggle("escondida", !abrir);
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

// Exige o RA completo (13 números + 1 dígito) - usado no login
function validarRACompleto(valor) {
    const ra = normalizarRA(valor);
    if (!/^\d{13}[0-9A-Z]$/.test(ra)) {
        throw new Error(`Preencha o RA completo. Ex.: 1234567890123-4`);
    }
    return ra;
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

// Limpa todas as bordas vermelhas dos campos de cadastro e desmarca os termos
function limparErrosCadastro() {
    const idsCampos = [
        "cadastro-nome", "cadastro-email", "cadastro-ra", "cadastro-senha",
        "responsavel-nome", "responsavel-telefone", "responsavel-email"
    ];
    idsCampos.forEach(id => {
        const campo = porId(id);
        if (campo) campo.style.borderColor = "";
    });
    const aceiteTermos = porId("aceite-termos");
    if (aceiteTermos) aceiteTermos.checked = false;
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
// Envia uma requisição real ao backend Flask.
async function apiDesenvolvimento(caminho, dados) {
    await new Promise(resolve => setTimeout(resolve, 200));

    if (caminho === "/sessao") {
        return { csrf_token: "token-teste", aluno: estado.aluno };
    }

    if (caminho === "/login") {
        return {
            csrf_token: "token-teste",
            aluno: estado.aluno || {
                id: 999,
                nome: "Aluno Teste",
                rosto_cadastrado: true
            }
        };
    }

    if (caminho === "/alunos") {
        return { csrf_token: "token-teste", aluno: dados };
    }

    if (caminho === "/recuperar-senha") {
        return {
            csrf_token: "token-teste",
            mensagem: "Link de recuperação enviado."
        };
    }

    if (caminho === "/presencas") {
        const dataHoje = new Date().toISOString().split("T")[0];
        return {
            hoje: estado.hoje || dataHoje,
            presencas: estado.historico
        };
    }

    if (caminho === "/presenca" || caminho === "/rosto") {
        const dataHoje = new Date().toISOString().split("T")[0];
        const horaAtual = new Date().toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit"
        });

        if (dados && dados.tipo) {
            estado.historico.push({
                tipo: dados.tipo,
                data: dataHoje,
                horario: horaAtual,
                motivo_saida: dados.motivo_saida || "",
                notificacao: "enviado"
            });
        }

        return {
            mensagem: "Operação realizada com sucesso!",
            notificacao: "enviado"
        };
    }

    if (caminho === "/logout") {
        return { csrf_token: "token-teste" };
    }

    return { csrf_token: "token-teste" };
}

// Envia as chamadas reais para o Flask ou usa a simulação quando o botão Dev estiver ativo.
async function api(caminho, dados) {
    if (modoDesenvolvimento) {
        return apiDesenvolvimento(caminho, dados);
    }

    const metodo = dados === undefined ? "GET" : "POST";
    const cabecalhos = { Accept: "application/json" };
    const opcoes = {
        method: metodo,
        credentials: "same-origin",
        cache: "no-store",
        headers: cabecalhos,
    };

    if (metodo !== "GET") {
        cabecalhos["Content-Type"] = "application/json";
        if (estado.csrf) cabecalhos["X-CSRF-Token"] = estado.csrf;
        opcoes.body = JSON.stringify(dados);
    }

    let resposta;
    try {
        resposta = await fetch(caminho, opcoes);
    } catch {
        throw new ErroRequisicao("Não foi possível conectar ao servidor. Confira se o iniciar-site está aberto.");
    }

    let retorno;
    try {
        retorno = await resposta.json();
    } catch {
        throw new ErroRequisicao("O servidor retornou uma resposta inválida.", resposta.status);
    }

    if (retorno.csrf_token) estado.csrf = retorno.csrf_token;
    if (!resposta.ok) {
        throw new ErroRequisicao(
            retorno.erro || retorno.mensagem || "Não foi possível concluir a operação.",
            resposta.status
        );
    }

    return retorno;
}

/* =================================================================
   5. CONTROLO DA CÂMARA E DAS TELAS
   ================================================================= */

// Desliga a câmara e limpa a memória dela
function pararCamera() {
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
    ["tela-login", "tela-cadastro", "tela-recuperar", "tela-redefinir-senha", "tela-facial", "tela-principal"].forEach((tela) => {
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
    if (modoDesenvolvimento) return true;
    const agora = new Date();
    const minutosAtuais = agora.getHours() * 60 + agora.getMinutes();

    // Permite registrar até 07h30, inclusive
    return minutosAtuais <= (7 * 60 + 30);
}


// Libera ou bloqueia os botões dependendo do que o aluno está a fazer

function atualizarBotoes() {
    const bloqueado = estado.ocupado;
    
    // Verifica se o checkbox de termos do login está marcado
    const checkboxTermos = porId("aceite-termos-login");
    const termosAceitos = checkboxTermos ? checkboxTermos.checked : false;
    
    // Configurações básicas de outros botões
    // O botão de login agora também exige 'termosAceitos'
    const btnLoginEl = porId("btn-login");
    if (btnLoginEl) {
        btnLoginEl.disabled = bloqueado || !estado.sessaoConhecida || !termosAceitos;
    }

    const btnCadastrarEl = porId("btn-cadastrar");
    if (btnCadastrarEl) {
        btnCadastrarEl.disabled = bloqueado || !estado.sessaoConhecida;
    }
    
    ["btn-primeiro-acesso", "btn-voltar-login", "btn-esqueceu-senha",
        "btn-voltar-login-recuperar", "btn-enviar-recuperacao", "btn-enviar-nova-senha",
        "btn-voltar-login-redefinir", "btn-atualizar-login",
        "btn-sair", "btn-cancelar-facial", "btn-reabrir-camera",
        "btn-atualizar", "btn-confirmar-saida"].forEach((id) => {
        const el = porId(id);
        if (el) el.disabled = bloqueado;
    });

    // Libera a confirmação quando há um quadro real da câmera.
    // O backend continua validando que há exatamente um rosto e que ele corresponde ao cadastro.
    const btnFacial = porId("btn-cadastrar-facial");
    if (btnFacial) {
        const naTelaFacial = (estado.tela === "tela-facial");
        const camera = porId("camera");
        const imagemPronta = Boolean(
            estado.cameraPronta && estado.stream && camera &&
            camera.readyState >= 2 && camera.videoWidth > 0
        );
        
        btnFacial.disabled = bloqueado || !naTelaFacial || !imagemPronta;
    }
    
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
            "tela-redefinir-senha": "mensagem-redefinir-senha",
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

// Aguarda um quadro real da câmera antes de liberar o botão de confirmação.
function aguardarImagemCamera(camera, limiteMs = 10000) {
    return new Promise((resolve, reject) => {
        const imagemPronta = () =>
            camera.readyState >= 2 && camera.videoWidth > 0 && camera.videoHeight > 0;

        if (imagemPronta()) {
            resolve();
            return;
        }

        let temporizador;
        const limpar = () => {
            clearTimeout(temporizador);
            camera.removeEventListener("loadeddata", verificar);
            camera.removeEventListener("playing", verificar);
            camera.removeEventListener("resize", verificar);
        };
        const verificar = () => {
            if (imagemPronta()) {
                limpar();
                resolve();
            }
        };
        temporizador = setTimeout(() => {
            limpar();
            reject(new Error("A câmera abriu, mas não enviou imagem. Feche outros aplicativos que possam estar usando a câmera e tente novamente."));
        }, limiteMs);

        camera.addEventListener("loadeddata", verificar);
        camera.addEventListener("playing", verificar);
        camera.addEventListener("resize", verificar);
        verificar();
    });
}

function mensagemErroCamera(erro) {
    if (erro && erro.name === "Error" && erro.message) return erro.message;

    switch (erro?.name) {
        case "NotAllowedError":
        case "PermissionDeniedError":
            return "O acesso à câmera foi bloqueado. Permita a câmera para este site nas configurações do navegador e recarregue a página.";
        case "NotFoundError":
        case "DevicesNotFoundError":
            return "Nenhuma câmera foi encontrada neste aparelho.";
        case "NotReadableError":
        case "TrackStartError":
            return "A câmera está ocupada ou bloqueada por outro aplicativo. Feche os outros aplicativos que a usam e tente novamente.";
        case "OverconstrainedError":
            return "Não foi possível iniciar a câmera deste aparelho. Tente novamente ou confira as permissões do navegador.";
        case "SecurityError":
            return "O navegador bloqueou a câmera. Abra o site pelo link HTTPS do túnel, não por HTTP.";
        default:
            return "Não consegui abrir a câmera" +
                (erro?.name ? " (" + erro.name + ")" : "") +
                ". Confira a permissão de câmera do navegador e tente novamente.";
    }
}

// Liga a câmera no navegador; a verificação facial definitiva fica no backend.
async function abrirCamera() {
    pararCamera();
    const versao = estado.cameraVersao;
    mensagem("mensagem-facial", "Abrindo a câmera...", "info");
    atualizarBotoes();
    try {
        if (!window.isSecureContext && !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
            throw new Error("Abra o site pelo endereço HTTPS do túnel para permitir o uso da câmera.");
        }
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error("Este navegador não disponibiliza a câmera. Abra o link no Chrome ou Safari atualizado.");
        }

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "user" }, width: { ideal: 640 }, height: { ideal: 480 } },
                audio: false,
            });
        } catch (erro) {
            if (erro?.name !== "OverconstrainedError") throw erro;
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }

        if (estado.tela !== "tela-facial" || versao !== estado.cameraVersao) {
            stream.getTracks().forEach((track) => track.stop());
            return;
        }
        estado.stream = stream;
        const camera = porId("camera");
        if (!camera) throw new Error("Não encontrei o vídeo da câmera na tela.");
        camera.srcObject = stream;
        await camera.play();
        await aguardarImagemCamera(camera);
        if (estado.tela !== "tela-facial" || versao !== estado.cameraVersao) return;

        estado.cameraPronta = true;
        mensagem("mensagem-facial", "Câmera pronta. Centralize apenas o seu rosto e toque em Confirmar.", "sucesso");
    } catch (erro) {
        if (versao !== estado.cameraVersao) return;
        pararCamera();
        estado.cameraPronta = false;
        mensagem("mensagem-facial", mensagemErroCamera(erro), "erro");
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


// Obtém a localização real do aluno pelo navegador
async function localizar() {
    if (!navigator.geolocation) {
        throw new Error("Seu navegador não suporta localização.");
    }

    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
            (posicao) => {
                resolve({
                    latitude: posicao.coords.latitude,
                    longitude: posicao.coords.longitude,
                    precisao: posicao.coords.accuracy
                });
            },
            (erro) => {
                if (erro.code === erro.PERMISSION_DENIED) {
                    reject(new Error("Você precisa permitir o acesso à localização."));
                } else if (erro.code === erro.POSITION_UNAVAILABLE) {
                    reject(new Error("Não foi possível identificar sua localização."));
                } else if (erro.code === erro.TIMEOUT) {
                    reject(new Error("O tempo para obter a localização terminou. Tente novamente."));
                } else {
                    reject(new Error("Erro ao obter sua localização."));
                }
            },
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            }
        );
    });
}


// Sai da conta do aluno
async function sair() {
    pararCamera();
    await api("/logout", {});
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

// Envia a nova senha junto com o token que veio no link de recuperação.
const btnEnviarNovaSenha = porId("btn-enviar-nova-senha");
if (btnEnviarNovaSenha) {
    btnEnviarNovaSenha.addEventListener("click", () => {
        void executar("mensagem-redefinir-senha", async () => {
            const campoSenha = porId("nova-senha");
            const campoConfirmacao = porId("confirmar-nova-senha");
            const senha = campoSenha ? campoSenha.value : "";
            const confirmacao = campoConfirmacao ? campoConfirmacao.value : "";

            if (!tokenRecuperacao) {
                throw new Error("Link inválido. Peça outro link de recuperação.");
            }
            if (senha.length > 128 || senha.trim().length < 8) {
                throw new Error("A senha precisa ter pelo menos 8 caracteres.");
            }
            if (senha !== confirmacao) {
                throw new Error("As senhas não são iguais.");
            }

            await api("/redefinir-senha", {
                token: tokenRecuperacao,
                senha
            });

            tokenRecuperacao = null;
            if (campoSenha) campoSenha.value = "";
            if (campoConfirmacao) campoConfirmacao.value = "";
            mensagem(
                "mensagem-redefinir-senha",
                "Senha redefinida. Agora volte ao login e entre com a senha nova.",
                "sucesso"
            );
        });
    });
}

// Volta ao login sem manter o token ou a senha digitada na página.
const btnVoltarLoginRedefinir = porId("btn-voltar-login-redefinir");
if (btnVoltarLoginRedefinir) {
    btnVoltarLoginRedefinir.addEventListener("click", () => {
        tokenRecuperacao = null;
        const campoSenha = porId("nova-senha");
        const campoConfirmacao = porId("confirmar-nova-senha");
        if (campoSenha) campoSenha.value = "";
        if (campoConfirmacao) campoConfirmacao.value = "";
        mensagem("mensagem-redefinir-senha");
        mostrarTela("tela-login");
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

            // O login normal sempre usa a API real, mesmo depois de testar o modo Dev.
            modoDesenvolvimento = false;
            const retorno = await api("/login", {
                RA: normalizarRA(raInput),
                senha
            });
            if (!retorno.aluno) {
                throw new Error("O servidor não retornou os dados do aluno.");
            }

            estado.aluno = retorno.aluno;
            const campoSenha = porId("login-senha");
            if (campoSenha) campoSenha.value = "";
            await irParaConta();
        });
    });
}

// Botão de criar conta com validação que pinta de vermelho os campos incorretos
const btnCadastrar = porId("btn-cadastrar");
if (btnCadastrar) {
    btnCadastrar.addEventListener("click", () => {
        void executar("mensagem-cadastro", async () => {
            // Limpa apenas as bordas vermelhas sem desmarcar o checkbox dos termos
            [
                "cadastro-nome", "cadastro-email", "cadastro-ra", "cadastro-senha",
                "responsavel-nome", "responsavel-telefone", "responsavel-email"
            ].forEach(id => {
                const campo = porId(id);
                if (campo) campo.style.borderColor = "";
            });

            // Pega os valores preenchidos nos inputs
            const nome = porId("cadastro-nome") ? porId("cadastro-nome").value.trim() : "";
            const email = porId("cadastro-email") ? porId("cadastro-email").value.trim() : "";
            const raInput = porId("cadastro-ra") ? porId("cadastro-ra").value : "";
            const senha = porId("cadastro-senha") ? porId("cadastro-senha").value : "";
            const nomeResp = porId("responsavel-nome") ? porId("responsavel-nome").value.trim() : "";
            const telResp = porId("responsavel-telefone") ? porId("responsavel-telefone").value.replace(/\D/g, "") : "";
            const emailResp = porId("responsavel-email") ? porId("responsavel-email").value.trim() : "";
            const aceiteTermos = porId("aceite-termos");

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
            if (aceiteTermos && !aceiteTermos.checked) {
                throw new Error("Você precisa ler e aceitar os Termos de Segurança e Uso de Dados Biométricos.");
            }

            // Se tudo estiver certo, envia os dados
            const dados = {
                nome,
                email,
                RA: normalizarRA(raInput),
                senha,
                nome_responsavel: nomeResp,
                telefone_responsavel: telResp,
                email_responsavel: emailResp,
                termos_aceitos: true
            };
            // O cadastro normal também deve ignorar a simulação do modo Dev.
            modoDesenvolvimento = false;
            const retorno = await api("/alunos", dados);
            
            if (!retorno.aluno) throw new Error("Não foi possível concluir o cadastro.");
            
            estado.aluno = retorno.aluno;
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
            const dadosAcao = {
                tipo: acao.tipo,
                motivo_saida: acao.motivo || "",
                imagem: foto
            };

            // A API exige localização para presença; no modo Dev, a simulação não usa GPS.
            if (!modoDesenvolvimento && acao.tipo !== "cadastro") {
                Object.assign(dadosAcao, await localizar());
            }

            await api(rota, dadosAcao);

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
            modoDesenvolvimento = true;

            // Define um aluno de teste fictício para liberar a interface
            estado.aluno = { id: 999, nome: "Aluno Teste (Atalho)", rosto_cadastrado: true };
            await irParaConta();
        });
    });
}


// Ouve alterações no checkbox de termos da tela de login para habilitar/desativar o botão Entrar
const checkboxTermosLogin = porId("aceite-termos-login");
if (checkboxTermosLogin) {
    checkboxTermosLogin.addEventListener("change", () => {
        atualizarBotoes();
    });
}


/* =================================================================
   7. EVENTOS DE COOKIES E TERMOS DE SEGURANÇA
   ================================================================= */

const btnAceitarCookies = porId("btn-aceitar-cookies");
if (btnAceitarCookies) {
    btnAceitarCookies.addEventListener("click", () => {
        definirCookie("controle_escolar_cookies", "aceito", 180);
        const banner = porId("banner-cookies");
        if (banner) banner.classList.add("escondida");
    });
}

["link-abrir-termos", "link-cookies-termos"].forEach((id) => {
    const link = porId(id);
    if (link) {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            alternarModalTermos(true);
        });
    }
});

const btnFecharTermos = porId("btn-fechar-termos");
if (btnFecharTermos) {
    btnFecharTermos.addEventListener("click", () => {
        alternarModalTermos(false);
    });
}

const modalTermos = porId("modal-termos");
if (modalTermos) {
    modalTermos.addEventListener("click", (e) => {
        if (e.target === modalTermos) alternarModalTermos(false);
    });
}


/* =================================================================
   6.1 MOSTRAR / OCULTAR SENHA (OLHINHO)
   ================================================================= */

function resetarVisibilidadeSenhas() {
    document.querySelectorAll(".btn-toggle-senha").forEach((botao) => {
        const idCampo = botao.getAttribute("data-alvo");
        const campo = idCampo ? porId(idCampo) : null;
        const iconeAberto = botao.querySelector(".icone-olho-aberto");
        const iconeFechado = botao.querySelector(".icone-olho-fechado");

        if (campo) campo.type = "password";
        botao.setAttribute("aria-pressed", "false");
        if (iconeAberto) iconeAberto.style.display = "inline";
        if (iconeFechado) iconeFechado.style.display = "none";
    });
}

document.querySelectorAll(".btn-toggle-senha").forEach((botao) => {
    botao.addEventListener("click", () => {
        const idCampo = botao.getAttribute("data-alvo");
        const campo = idCampo ? porId(idCampo) : null;
        if (!campo) return;

        const estaVisivel = campo.type === "text";
        campo.type = estaVisivel ? "password" : "text";
        botao.setAttribute("aria-pressed", String(!estaVisivel));

        const iconeAberto = botao.querySelector(".icone-olho-aberto");
        const iconeFechado = botao.querySelector(".icone-olho-fechado");
        if (iconeAberto) iconeAberto.style.display = estaVisivel ? "inline" : "none";
        if (iconeFechado) iconeFechado.style.display = estaVisivel ? "none" : "inline";
    });
});


/* =================================================================
   8. LIGAR O SISTEMA
   ================================================================= */

// Executado automaticamente assim que a página abre para preparar tudo
// Ao abrir, busca no servidor se já existe uma sessão real.
void executar("mensagem-login", async () => {
    verificarConsentimentoCookies();

    // Enquanto o servidor responde, mantém as ações bloqueadas.
    estado.sessaoConhecida = false;
    estado.historicoCarregado = false;
    atualizarBotoes();

    const retorno = await api("/sessao");

    // A função api atualiza o token CSRF com a resposta do servidor.
    estado.aluno = retorno.aluno || null;
    estado.sessaoConhecida = true;

    if (tokenRecuperacao) {
        // Guarda o token na memória e remove-o da barra de endereço.
        window.history.replaceState({}, document.title, window.location.pathname);
        mostrarTela("tela-redefinir-senha");
    } else if (estado.aluno) {
        await irParaConta();
    } else {
        estado.historico = [];
        estado.hoje = null;
        estado.historicoCarregado = true;
        mostrarTela("tela-login");
    }

    atualizarBotoes();
});
