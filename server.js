const express = require("express");
const cors = require("cors");
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Garantir diretório de screenshots
if (!fs.existsSync("screenshots")) {
  fs.mkdirSync("screenshots", { recursive: true });
}
app.use('/screenshots', express.static('screenshots'));

// Estado global
const state = {
  browser: null,
  context: null,
  page: null,
  isLogged: false,
  processing: false
};

// Configurações
const CONFIG = {
  BASE_URL: 'https://y1c7m5s.com',
  LOGIN_URL: 'https://y1c7m5s.com/main/entrar',
  HOME_URL: 'https://y1c7m5s.com/main/inicio',
  DEPOSIT_URL: 'https://y1c7m5s.com/main/deposito',
  HEADLESS: true,
  TIMEOUT: 60000,
  PLATFORM_EMAIL: process.env.PLATFORM_EMAIL || "",
  PLATFORM_PASSWORD: process.env.PLATFORM_PASSWORD || "",
  PROXY_SERVER: process.env.PROXY_SERVER || ""
};

// Função para salvar screenshot
async function saveScreenshot(page, name) {
  try {
    const timestamp = Date.now();
    const filename = `${name}_${timestamp}.png`;
    const filepath = path.join('screenshots', filename);
    await page.screenshot({ path: filepath, fullPage: true });
    return `/screenshots/${filename}`;
  } catch (error) {
    console.error(`Erro ao salvar screenshot ${name}:`, error);
    return null;
  }
}

// =============================================
// FUNÇÃO INTELIGENTE PARA BLOQUEAR ANÚNCIOS
// =============================================

// Lista de padrões de URLs de anúncios para bloquear
const AD_PATTERNS = [
  'doubleclick',
  'googlesyndication',
  'googleadservices',
  'adservice',
  'advertising',
  'adsense',
  'adnxs',
  'taboola',
  'outbrain',
  'popads',
  'popcash',
  'adsterra',
  'exoclick',
  'juicyads',
  'propellerads',
  'monetag',
  'adnetwork',
  'banner',
  'popup',
  'modal',
  'overlay'
];

// Função para interceptar e bloquear requisições de anúncios
async function setupAdBlocker(page) {
  console.log('🛡️ Configurando bloqueador de anúncios...');
  
  // Bloquear requisições de URLs de anúncios
  await page.route('**/*', async (route) => {
    const url = route.request().url().toLowerCase();
    
    // Verificar se a URL corresponde a padrões de anúncio
    if (AD_PATTERNS.some(pattern => url.includes(pattern))) {
      await route.abort();
      return;
    }
    
    // Bloquear scripts de popup
    if (url.includes('pop') || url.includes('modal') || url.includes('dialog')) {
      await route.abort();
      return;
    }
    
    // Continuar com requisições normais
    await route.continue();
  });
  
  // Injetar CSS para esconder elementos de anúncio
  await page.addStyleTag({
    content: `
      /* Esconder overlays, modais e popups */
      [class*="overlay"],
      [class*="modal"],
      [class*="popup"],
      [class*="dialog"],
      [class*="advert"],
      [class*="banner"],
      [id*="overlay"],
      [id*="modal"],
      [id*="popup"],
      [id*="advert"],
      [id*="banner"] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
      
      /* Esconder iframes de anúncio */
      iframe[src*="ad"],
      iframe[src*="pop"],
      iframe[src*="banner"] {
        display: none !important;
      }
    `
  });
  
  // Injetar script para remover anúncios do DOM
  await page.addInitScript(() => {
    // Função para remover elementos de anúncio
    function removeAds() {
      const selectors = [
        '[class*="overlay"]',
        '[class*="modal"]',
        '[class*="popup"]',
        '[class*="dialog"]',
        '[class*="advert"]',
        '[class*="banner"]',
        '[id*="overlay"]',
        '[id*="modal"]',
        '[id*="popup"]',
        '[id*="advert"]',
        '[id*="banner"]',
        'iframe[src*="ad"]',
        'iframe[src*="pop"]'
      ];
      
      selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          el.remove();
        });
      });
    }
    
    // Executar ao carregar
    window.addEventListener('DOMContentLoaded', removeAds);
    window.addEventListener('load', removeAds);
    
    // Executar periodicamente para pegar anúncios que aparecem depois
    setInterval(removeAds, 1000);
    
    // Interceptar criação de modais
    const observer = new MutationObserver(() => {
      removeAds();
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
  });
  
  console.log('✅ Bloqueador de anúncios configurado!');
}

// Função para inicializar browser
async function initBrowser() {
  if (state.browser) {
    await state.browser.close().catch(() => {});
    state.browser = null;
  }
  
  const launchOptions = {
    headless: CONFIG.HEADLESS,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080',
      '--disable-popup-blocking',
      '--disable-notifications',
      '--disable-extensions'
    ]
  };
  
  if (CONFIG.PROXY_SERVER) {
    launchOptions.proxy = {
      server: `http://${CONFIG.PROXY_SERVER}`
    };
    console.log('🔄 Usando proxy:', CONFIG.PROXY_SERVER);
  } else {
    console.log('⚠️ Nenhum proxy configurado - usando IP local');
  }
  
  state.browser = await chromium.launch(launchOptions);
  
  state.context = await state.browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ignoreHTTPSErrors: true
  });
  
  state.page = await state.context.newPage();
  
  // Configurar bloqueador de anúncios
  await setupAdBlocker(state.page);
  
  return state.page;
}

// Função para fechar anúncios (caso ainda apareçam)
async function fecharAnuncio() {
  console.log('🔧 Verificando se há anúncios para fechar...');
  
  try {
    const page = state.page;
    
    const fechado = await page.evaluate(() => {
      // Procurar X visível
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        const text = (el.innerText || el.textContent || '').trim();
        if ((text === 'X' || text === 'x' || text === '✕' || text === '✖' || text === '×') && el.offsetParent !== null) {
          el.click();
          return true;
        }
      }
      return false;
    });
    
    if (fechado) {
      await page.waitForTimeout(2000);
      console.log('✅ Anúncio fechado');
      return { success: true };
    }
    
    // Se não achou, tentar ESC
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
    
    return { success: true };
    
  } catch (error) {
    console.error('❌ Erro ao fechar anúncio:', error.message);
    return { success: false, error: error.message };
  }
}

// Função para fazer login
async function fazerLogin(email, senha) {
  console.log('🔐 Fazendo login na plataforma...');
  
  try {
    const page = state.page;
    
    await page.goto(CONFIG.LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT });
    await page.waitForTimeout(5000);
    await saveScreenshot(page, '1_login_page');
    
    await fecharAnuncio();
    await page.waitForTimeout(2000);
    await saveScreenshot(page, '1b_apos_fechar_anuncio');
    
    console.log('📧 Preenchendo email...');
    
    const emailPreenchido = await page.evaluate((email) => {
      const inputs = document.querySelectorAll('input');
      for (const input of inputs) {
        if (input.type === 'email' || 
            input.name.toLowerCase().includes('email') || 
            input.placeholder.toLowerCase().includes('email') || 
            input.placeholder.toLowerCase().includes('usuário') ||
            input.placeholder.toLowerCase().includes('usuario')) {
          input.value = email;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      for (const input of inputs) {
        if (input.offsetParent !== null) {
          input.value = email;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    }, email);
    
    if (!emailPreenchido) {
      console.error('❌ Campo de email não encontrado');
      await saveScreenshot(page, 'erro_campo_email');
      return { success: false, error: 'Campo de email não encontrado' };
    }
    
    await page.waitForTimeout(2000);
    await saveScreenshot(page, '2_email_preenchido');
    
    console.log('🔘 Clicando em continuar...');
    const continuarClicado = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, a, input[type="submit"], ion-button');
      for (const btn of buttons) {
        const text = btn.innerText || btn.value || '';
        if (text.includes('Continuar') || text.includes('Avançar') || 
            text.includes('Próximo') || text.includes('Proximo') || 
            text.includes('OK') || text.includes('Ok') || 
            text.includes('Enviar')) {
          btn.click();
          return true;
        }
      }
      return false;
    });
    
    if (!continuarClicado) {
      console.log('⚠️ Botão continuar não encontrado, tentando Enter...');
      await page.keyboard.press('Enter');
    }
    
    await page.waitForTimeout(5000);
    await fecharAnuncio();
    await saveScreenshot(page, '3_apos_continuar');
    
    console.log('🔑 Preenchendo senha...');
    
    const senhaPreenchida = await page.evaluate((senha) => {
      const inputs = document.querySelectorAll('input');
      for (const input of inputs) {
        if (input.type === 'password') {
          input.value = senha;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    }, senha);
    
    if (!senhaPreenchida) {
      console.error('❌ Campo de senha não encontrado');
      await saveScreenshot(page, 'erro_campo_senha');
      return { success: false, error: 'Campo de senha não encontrado' };
    }
    
    await page.waitForTimeout(2000);
    await saveScreenshot(page, '4_senha_preenchida');
    
    console.log('🔘 Clicando em entrar...');
    const entrarClicado = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, a, input[type="submit"], ion-button');
      for (const btn of buttons) {
        const text = btn.innerText || btn.value || '';
        if (text.includes('Entrar') || text.includes('Login') || 
            text.includes('Acessar') || text.includes('Continuar')) {
          btn.click();
          return true;
        }
      }
      return false;
    });
    
    if (!entrarClicado) {
      console.log('⚠️ Botão entrar não encontrado, tentando Enter...');
      await page.keyboard.press('Enter');
    }
    
    await page.waitForTimeout(10000);
    await fecharAnuncio();
    await saveScreenshot(page, '5_apos_login');
    
    const currentUrl = page.url();
    console.log('📍 URL após login:', currentUrl);
    
    state.isLogged = true;
    console.log('✅ Login realizado com sucesso!');
    return { success: true };
    
  } catch (error) {
    console.error('❌ Erro no login:', error.message);
    await saveScreenshot(state.page, 'erro_login');
    return { success: false, error: error.message };
  }
}

// Função para navegar até depósito
async function navegarParaDeposito() {
  console.log('💰 Navegando para página de depósito...');
  
  try {
    const page = state.page;
    
    await page.goto(CONFIG.DEPOSIT_URL, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT });
    await page.waitForTimeout(5000);
    await saveScreenshot(page, '4_pagina_deposito');
    
    await fecharAnuncio();
    await page.waitForTimeout(2000);
    await saveScreenshot(page, '4b_pos_anuncio');
    
    const currentUrl = page.url();
    if (currentUrl.includes('entrar') || currentUrl.includes('login')) {
      console.log('⚠️ Precisando navegar manualmente para depósito');
      
      await page.goto(CONFIG.HOME_URL, { waitUntil: 'domcontentloaded', timeout: CONFIG.TIMEOUT });
      await page.waitForTimeout(3000);
      await fecharAnuncio();
      
      const depositLinks = await page.$$('a:has-text("Depósito"), a:has-text("Deposito"), a:has-text("deposito"), a:has-text("depósito"), button:has-text("Depósito"), ion-button:has-text("Depósito")');
      
      for (const link of depositLinks) {
        const href = await link.getAttribute('href');
        if (href && href.includes('deposit')) {
          await link.click();
          await page.waitForTimeout(5000);
          await fecharAnuncio();
          break;
        }
      }
    }
    
    await saveScreenshot(page, '5_deposito_final');
    return { success: true };
    
  } catch (error) {
    console.error('❌ Erro ao navegar para depósito:', error.message);
    return { success: false, error: error.message };
  }
}

// Função para selecionar PIX
async function selecionarPIX() {
  console.log('💳 Selecionando método PIX...');
  
  try {
    const page = state.page;
    
    const pixSelecionado = await page.evaluate(() => {
      const elements = document.querySelectorAll('button, div, span, ion-button, ion-segment-button, a');
      for (const el of elements) {
        const text = el.innerText || el.textContent || '';
        if (text.trim() === 'PIX' || text.trim() === 'Pix') {
          el.click();
          return true;
        }
      }
      return false;
    });
    
    if (pixSelecionado) {
      await page.waitForTimeout(3000);
      await saveScreenshot(page, '6_pix_selecionado');
      console.log('✅ PIX selecionado');
    } else {
      console.log('⚠️ Botão PIX não encontrado, verificando se já está selecionado');
      await saveScreenshot(page, '6_sem_botao_pix');
    }
    
    return { success: true };
    
  } catch (error) {
    console.error('❌ Erro ao selecionar PIX:', error.message);
    return { success: false, error: error.message };
  }
}

// Função para preencher valor
async function preencherValor(valor) {
  console.log(`💵 Preenchendo valor: R$ ${valor}`);
  
  try {
    const page = state.page;
    
    await fecharAnuncio();
    await page.waitForTimeout(1000);
    
    const valorPreenchido = await page.evaluate((valor) => {
      // Método 1: Procurar pelo id ion-input-0
      const ionInput = document.getElementById('ion-input-0');
      if (ionInput) {
        ionInput.value = valor;
        ionInput.dispatchEvent(new Event('input', { bubbles: true }));
        ionInput.dispatchEvent(new Event('change', { bubbles: true }));
        ionInput.dispatchEvent(new Event('ionInput', { bubbles: true }));
        ionInput.dispatchEvent(new Event('ionChange', { bubbles: true }));
        return true;
      }
      
      // Método 2: Procurar input com placeholder 10 - 50.000
      const inputs = document.querySelectorAll('input');
      for (const input of inputs) {
        if (input.placeholder && input.placeholder.includes('50.000')) {
          input.value = valor;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('ionInput', { bubbles: true }));
          input.dispatchEvent(new Event('ionChange', { bubbles: true }));
          return true;
        }
      }
      
      // Método 3: Primeiro input type=number visível
      for (const input of inputs) {
        if (input.type === 'number' && input.offsetParent !== null) {
          input.value = valor;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('ionInput', { bubbles: true }));
          input.dispatchEvent(new Event('ionChange', { bubbles: true }));
          return true;
        }
      }
      
      return false;
    }, valor.toString());
    
    if (!valorPreenchido) {
      console.error('❌ Campo de valor não encontrado');
      await saveScreenshot(page, 'erro_campo_valor');
      return { success: false, error: 'Campo de valor não encontrado' };
    }
    
    await page.waitForTimeout(3000);
    await saveScreenshot(page, '7_valor_preenchido');
    console.log('✅ Valor preenchido');
    return { success: true };
    
  } catch (error) {
    console.error('❌ Erro ao preencher valor:', error.message);
    return { success: false, error: error.message };
  }
}

// Função para gerar PIX
async function gerarPIX() {
  console.log('🎯 Gerando PIX...');
  
  try {
    const page = state.page;
    
    const gerado = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, a, input[type="submit"], ion-button, div[role="button"]');
      for (const btn of buttons) {
        const text = btn.innerText || btn.value || btn.textContent || '';
        if (text.includes('Depositar') || text.includes('Deposito') || 
            text.includes('Gerar') || text.includes('Continuar') || 
            text.includes('Confirmar')) {
          btn.click();
          return true;
        }
      }
      return false;
    });
    
    if (gerado) {
      await page.waitForTimeout(8000);
      await saveScreenshot(page, '8_pix_gerado');
      console.log('✅ Botão de depositar clicado');
    } else {
      console.error('❌ Botão de depositar não encontrado');
      await saveScreenshot(page, 'erro_botao_gerar');
      return { success: false, error: 'Botão de depositar não encontrado' };
    }
    
    return { success: true };
    
  } catch (error) {
    console.error('❌ Erro ao gerar PIX:', error.message);
    return { success: false, error: error.message };
  }
}

// Função para extrair código PIX
async function extrairCodigoPIX() {
  console.log('🔍 Extraindo código PIX...');
  
  try {
    const page = state.page;
    
    await page.waitForTimeout(5000);
    await saveScreenshot(page, '9_extraindo_pix');
    
    const pixCode = await page.evaluate(() => {
      const patterns = [
        /00020126\d{20,}/,
        /000201[0-9]{20,}/,
        /[0-9]{32,}/,
        /[A-Z0-9]{32,}/
      ];
      
      const allText = document.body.innerText;
      
      for (const pattern of patterns) {
        const matches = allText.match(pattern);
        if (matches && matches[0]) {
          return matches[0];
        }
      }
      
      const inputs = document.querySelectorAll('input, textarea');
      for (const input of inputs) {
        const value = input.value || '';
        if (value.length > 30) {
          return value;
        }
      }
      
      const codeElements = document.querySelectorAll('[class*="pix"], [class*="qr"], [class*="code"], [id*="pix"], [id*="qr"], [id*="code"]');
      for (const el of codeElements) {
        const text = el.textContent || el.value || '';
        if (text.length > 30) {
          return text;
        }
      }
      
      const qrImages = document.querySelectorAll('img[src*="qr"], canvas, img[alt*="qr" i], img[alt*="pix" i]');
      if (qrImages.length > 0) {
        const qrSrc = qrImages[0].src || '';
        if (qrSrc.length > 0) {
          return qrSrc;
        }
      }
      
      return null;
    });
    
    if (!pixCode) {
      const shadowPix = await page.evaluate(() => {
        const elements = document.querySelectorAll('*');
        for (let el of elements) {
          if (el.shadowRoot) {
            const text = el.shadowRoot.textContent;
            const matches = text.match(/(?:00020126\d{20,}|000201[0-9]{20,}|[0-9]{32,}|[A-Z0-9]{32,})/g);
            if (matches && matches[0]) {
              return matches[0];
            }
          }
        }
        return null;
      });
      
      if (shadowPix) {
        console.log('✅ Código PIX encontrado no shadow DOM');
        return { success: true, pixCode: shadowPix };
      }
    }
    
    if (pixCode) {
      console.log('✅ Código PIX encontrado!');
      console.log('📋 Código:', pixCode.substring(0, 50) + '...');
      return { success: true, pixCode };
    }
    
    console.error('❌ Código PIX não encontrado');
    await saveScreenshot(page, '10_pix_nao_encontrado');
    return { success: false, error: 'Código PIX não encontrado' };
    
  } catch (error) {
    console.error('❌ Erro ao extrair código PIX:', error.message);
    return { success: false, error: error.message };
  }
}

// Função principal para gerar depósito PIX
async function gerarDepositoPIX(valor) {
  console.log(`\n🚀 INICIANDO GERAÇÃO DE PIX - Valor: R$ ${valor}\n`);
  
  try {
    await initBrowser();
    
    // 1. Fazer login
    const loginResult = await fazerLogin(CONFIG.PLATFORM_EMAIL, CONFIG.PLATFORM_PASSWORD);
    if (!loginResult.success) {
      return loginResult;
    }
    
    // 2. Navegar para depósito
    const navResult = await navegarParaDeposito();
    if (!navResult.success) {
      return navResult;
    }
    
    // 3. Selecionar PIX
    const pixResult = await selecionarPIX();
    if (!pixResult.success) {
      return pixResult;
    }
    
    // 4. Preencher valor
    const valorResult = await preencherValor(valor);
    if (!valorResult.success) {
      return valorResult;
    }
    
    // 5. Gerar PIX
    const gerarResult = await gerarPIX();
    if (!gerarResult.success) {
      return gerarResult;
    }
    
    // 6. Extrair código
    const codigoResult = await extrairCodigoPIX();
    if (codigoResult.success) {
      return {
        success: true,
        pixCode: codigoResult.pixCode,
        valor: valor,
        message: 'PIX gerado com sucesso!'
      };
    }
    
    return codigoResult;
    
  } catch (error) {
    console.error('❌ Erro geral:', error.message);
    return { success: false, error: error.message };
  }
}

// ==========================================
// ROTAS
// ==========================================

// Rota principal
app.get("/", (req, res) => {
  res.send("Backend online! Sistema de PIX funcionando. Acesse /teste para testar.");
});

// Rota GET para página de teste
app.get("/teste", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Teste PIX</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: Arial; max-width: 400px; margin: 50px auto; padding: 20px; background: #f0f0f0; }
        .container { background: white; padding: 30px; border-radius: 10px; }
        h2 { text-align: center; }
        input { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box; }
        button { width: 100%; padding: 12px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
        button:disabled { background: #ccc; }
        #resultado { margin-top: 20px; padding: 15px; border-radius: 5px; display: none; word-break: break-all; }
        .sucesso { background: #d4edda; color: #155724; }
        .erro { background: #f8d7da; color: #721c24; }
        #loading { display: none; text-align: center; margin: 20px 0; }
        textarea { width: 100%; height: 100px; padding: 10px; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>💰 Gerar PIX</h2>
        <label>Valor (R$):</label>
        <input type="number" id="valor" value="100" min="20">
        <label>Produto:</label>
        <input type="text" id="produto" value="Produto Teste">
        <label>Cliente:</label>
        <input type="text" id="cliente" value="Cliente Teste">
        <button id="btnGerar" onclick="gerarPix()">Gerar PIX</button>
        <div id="loading"><p>⏳ Gerando PIX... Aguarde 30-60 segundos</p></div>
        <div id="resultado"></div>
      </div>
      <script>
        async function gerarPix() {
          const valor = document.getElementById('valor').value;
          const produto = document.getElementById('produto').value;
          const cliente = document.getElementById('cliente').value;
          if (!valor || valor < 20) { alert('Valor mínimo é R$ 20'); return; }
          const btn = document.getElementById('btnGerar');
          const loading = document.getElementById('loading');
          const resultado = document.getElementById('resultado');
          btn.disabled = true;
          loading.style.display = 'block';
          resultado.style.display = 'none';
          try {
            const response = await fetch('/deposito', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ valor: parseFloat(valor), produto, cliente })
            });
            const data = await response.json();
            loading.style.display = 'none';
            resultado.style.display = 'block';
            if (data.status === 'ok') {
              resultado.className = 'sucesso';
              resultado.innerHTML = '<h3>✅ PIX Gerado!</h3><p><strong>Valor:</strong> R$ ' + valor + '</p><p><strong>Código PIX:</strong></p><textarea readonly>' + data.pix_code + '</textarea>';
            } else {
              resultado.className = 'erro';
              resultado.innerHTML = '<h3>❌ Erro</h3><p>' + (data.message || 'Erro desconhecido') + '</p>';
            }
          } catch (error) {
            loading.style.display = 'none';
            resultado.style.display = 'block';
            resultado.className = 'erro';
            resultado.innerHTML = '<h3>❌ Erro de Conexão</h3><p>' + error.message + '</p>';
          } finally {
            btn.disabled = false;
          }
        }
      </script>
    </body>
    </html>
  `);
});

// Health Check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "Servidor funcionando!" });
});

// Rota para screenshots de debug
app.get("/debug-screenshots", (req, res) => {
  try {
    const files = fs.readdirSync("screenshots");
    const screenshots = files.map(file => ({ filename: file, url: `/screenshots/${file}` }));
    res.json({ status: "ok", screenshots });
  } catch (error) {
    res.json({ status: "erro", screenshots: [], error: error.message });
  }
});

// Rota para gerar PIX
app.post("/deposito", async (req, res) => {
  try {
    const { valor, produto, cliente } = req.body;
    console.log("💰 Nova solicitação de PIX:", { valor, produto, cliente });
    
    if (!valor) {
      return res.status(400).json({ status: "erro", message: "Valor é obrigatório" });
    }
    
    if (state.processing) {
      return res.status(429).json({ status: "erro", message: "Sistema ocupado" });
    }
    
    state.processing = true;
    const resultado = await gerarDepositoPIX(valor);
    state.processing = false;
    
    if (resultado.success) {
      return res.status(200).json({ status: "ok", pix_code: resultado.pixCode, valor, message: "PIX gerado!" });
    } else {
      return res.status(500).json({ status: "erro", message: resultado.error || "Falha ao gerar PIX" });
    }
  } catch (error) {
    state.processing = false;
    console.error(error);
    return res.status(500).json({ status: "erro", message: "Erro interno" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`💰 Página de teste: http://localhost:${PORT}/teste`);
  console.log(`📊 Configurações:`);
  console.log(`    PLATFORM_EMAIL: ${CONFIG.PLATFORM_EMAIL ? '✅ Configurado' : '❌ Não configurado'}`);
  console.log(`    PLATFORM_PASSWORD: ${CONFIG.PLATFORM_PASSWORD ? '✅ Configurado' : '❌ Não configurado'}`);
});
