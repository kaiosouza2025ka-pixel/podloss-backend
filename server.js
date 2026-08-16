const express = require("express");
const cors = require("cors");
const { chromium } = require("playwright");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Servir arquivos estáticos da pasta public
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
  token: null,
  isLogged: false,
  processing: false,
  lastPixCode: null
};

// Configurações
const CONFIG = {
  LOGIN_URL: 'https://y1c7m5s.com/main/entrar',
  DEPOSIT_URL: 'https://y1c7m5s.com/main/deposito',
  API_BASE: 'https://y1c7m5s.com/api',
  HEADLESS: process.env.HEADLESS !== 'false',
  TIMEOUT: 30000
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

// Função para inicializar browser
async function initBrowser() {
  if (state.browser) {
    await state.browser.close().catch(() => {});
    state.browser = null;
  }
  
  state.browser = await chromium.launch({
    headless: CONFIG.HEADLESS,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d',
      '--disable-gpu',
      '--window-size=1920,1080'
    ]
  });
  
  state.context = await state.browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ignoreHTTPSErrors: true
  });
  
  state.page = await state.context.newPage();
  
  // Capturar respostas de rede
  state.page.on('response', async (response) => {
    try {
      const url = response.url();
      if (url.includes('token') || url.includes('auth') || url.includes('login') || 
          url.includes('deposit') || url.includes('pix') || url.includes('payment')) {
        const data = await response.json().catch(() => null);
        if (data) {
          if (data.token || data.access_token || data.jwt || data.sessionToken) {
            state.token = data.token || data.access_token || data.jwt || data.sessionToken;
          }
          if (data.pixCode || data.qrCode || data.code || data.emv) {
            state.lastPixCode = data.pixCode || data.qrCode || data.code || data.emv;
          }
        }
      }
    } catch (error) {
      // Ignorar erros de parsing
    }
  });
  
  return state.page;
}

// Estratégia 1: Interceptar API de autenticação
async function strategy1_login(email, password) {
  console.log('🎯 Estratégia 1: Interceptar API de autenticação');
  
  try {
    const page = await initBrowser();
    const tokens = [];
    
    page.on('response', async (response) => {
      try {
        const url = response.url();
        if (url.includes('auth') || url.includes('login') || url.includes('session') || url.includes('token')) {
          const data = await response.json().catch(() => null);
          if (data) {
            const token = data.token || data.access_token || data.jwt || data.sessionToken || data.accessToken;
            if (token) {
              tokens.push(token);
              state.token = token;
            }
          }
        }
      } catch (error) {
        // Ignorar
      }
    });
    
    await page.goto(CONFIG.LOGIN_URL, { waitUntil: 'networkidle', timeout: CONFIG.TIMEOUT });
    await page.waitForTimeout(2000);
    await saveScreenshot(page, 'login_page');
    
    const emailSelectors = [
      'input[type="email"]',
      'input[name="email"]',
      'input[placeholder*="email" i]',
      'input[placeholder*="e-mail" i]',
      'input[placeholder*="usuário" i]',
      'input[placeholder*="usuario" i]',
      'input[formcontrolname="email"]'
    ];
    
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      'input[placeholder*="senha" i]',
      'input[formcontrolname="password"]'
    ];
    
    let emailInput = null;
    let passwordInput = null;
    
    for (const selector of emailSelectors) {
      emailInput = await page.$(selector);
      if (emailInput) break;
    }
    
    for (const selector of passwordSelectors) {
      passwordInput = await page.$(selector);
      if (passwordInput) break;
    }
    
    if (emailInput && passwordInput) {
      await emailInput.fill(email);
      await passwordInput.fill(password);
      await page.waitForTimeout(1000);
      
      const submitSelectors = [
        'button[type="submit"]',
        'button:has-text("Entrar")',
        'button:has-text("Login")',
        'button:has-text("Acessar")',
        'button:has-text("Continuar")',
        'ion-button:has-text("Entrar")',
        'ion-button:has-text("Login")'
      ];
      
      let submitButton = null;
      for (const selector of submitSelectors) {
        submitButton = await page.$(selector);
        if (submitButton) break;
      }
      
      if (submitButton) {
        await submitButton.click();
        await page.waitForTimeout(5000);
        await saveScreenshot(page, 'after_login_attempt');
      }
    }
    
    if (tokens.length > 0) {
      state.token = tokens[0];
      state.isLogged = true;
      return { success: true, token: tokens[0], strategy: 1 };
    }
    
    return { success: false, strategy: 1 };
  } catch (error) {
    console.error('❌ Erro na Estratégia 1:', error.message);
    return { success: false, strategy: 1, error: error.message };
  }
}

// Estratégia 2: Chamada direta à API
async function strategy2_api_pix(email, password, valor, identificador) {
  console.log('🎯 Estratégia 2: Chamada direta à API');
  
  try {
    if (!state.token) {
      const loginEndpoints = [
        `${CONFIG.API_BASE}/auth/login`,
        `${CONFIG.API_BASE}/login`,
        `${CONFIG.API_BASE}/session`,
        `${CONFIG.API_BASE}/auth`
      ];
      
      for (const endpoint of loginEndpoints) {
        try {
          const loginResponse = await axios.post(endpoint, {
            email,
            password
          }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
          });
          
          if (loginResponse.data) {
            state.token = loginResponse.data.token || 
                         loginResponse.data.access_token || 
                         loginResponse.data.jwt || 
                         loginResponse.data.sessionToken;
            
            if (state.token) break;
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    if (!state.token) {
      return { success: false, strategy: 2, error: 'Token não disponível' };
    }
    
    const headers = {
      'Authorization': `Bearer ${state.token}`,
      'Content-Type': 'application/json'
    };
    
    const depositEndpoints = [
      `${CONFIG.API_BASE}/deposit/pix`,
      `${CONFIG.API_BASE}/pix/generate`,
      `${CONFIG.API_BASE}/deposit`,
      `${CONFIG.API_BASE}/payment/pix`
    ];
    
    for (const endpoint of depositEndpoints) {
      try {
        const pixResponse = await axios.post(endpoint, {
          amount: valor,
          value: valor,
          valor: valor,
          cpf: identificador,
          identifier: identificador
        }, { 
          headers,
          timeout: 15000
        });
        
        if (pixResponse.data) {
          const pixCode = pixResponse.data.pixCode || 
                         pixResponse.data.qrCode || 
                         pixResponse.data.code || 
                         pixResponse.data.pix ||
                         pixResponse.data.emv;
          
          if (pixCode) {
            state.lastPixCode = pixCode;
            return { success: true, pixCode, strategy: 2 };
          }
        }
      } catch (error) {
        continue;
      }
    }
    
    return { success: false, strategy: 2 };
  } catch (error) {
    console.error('❌ Erro na Estratégia 2:', error.message);
    return { success: false, strategy: 2, error: error.message };
  }
}

// Estratégia 3: UI completa
async function strategy3_ui_pix(email, password, valor, identificador) {
  console.log('🎯 Estratégia 3: UI completa');
  
  try {
    if (!state.page || !state.isLogged) {
      await strategy1_login(email, password);
    }
    
    const page = state.page;
    
    await page.goto(CONFIG.DEPOSIT_URL, { waitUntil: 'networkidle', timeout: CONFIG.TIMEOUT });
    await page.waitForTimeout(3000);
    await saveScreenshot(page, 'deposit_page');
    
    const pixSelectors = [
      'button:has-text("PIX")',
      'button:has-text("Pix")',
      'div:has-text("PIX")',
      'ion-segment-button:has-text("PIX")',
      'ion-button:has-text("PIX")',
      '[value="pix"]',
      'input[value="pix"]'
    ];
    
    for (const selector of pixSelectors) {
      const pixButton = await page.$(selector);
      if (pixButton) {
        await pixButton.click();
        await page.waitForTimeout(2000);
        break;
      }
    }
    
    const amountSelectors = [
      'input[type="number"]',
      'input[name="amount"]',
      'input[name="valor"]',
      'input[name="value"]',
      'input[placeholder*="valor" i]',
      'input[placeholder*="value" i]',
      'input[placeholder*="amount" i]'
    ];
    
    for (const selector of amountSelectors) {
      const amountInput = await page.$(selector);
      if (amountInput) {
        await amountInput.fill(valor.toString());
        await page.waitForTimeout(1000);
        break;
      }
    }
    
    if (identificador) {
      const cpfSelectors = [
        'input[name="cpf"]',
        'input[placeholder*="CPF" i]',
        'input[placeholder*="cpf" i]',
        'input[placeholder*="identificador" i]'
      ];
      
      for (const selector of cpfSelectors) {
        const cpfInput = await page.$(selector);
        if (cpfInput) {
          await cpfInput.fill(identificador);
          await page.waitForTimeout(1000);
          break;
        }
      }
    }
    
    const generateSelectors = [
      'button:has-text("Gerar")',
      'button:has-text("Continuar")',
      'button:has-text("Confirmar")',
      'button:has-text("Gerar PIX")',
      'button[type="submit"]',
      'ion-button:has-text("Gerar")',
      'ion-button:has-text("Continuar")'
    ];
    
    for (const selector of generateSelectors) {
      const generateButton = await page.$(selector);
      if (generateButton) {
        await generateButton.click();
        await page.waitForTimeout(5000);
        await saveScreenshot(page, 'after_generate');
        break;
      }
    }
    
    const pixCode = await page.evaluate(() => {
      const patterns = [
        /00020126\d{20,}/,
        /[0-9]{32,}/,
        /[A-Z0-9]{32,}/
      ];
      
      const textContent = document.body.innerText;
      
      for (const pattern of patterns) {
        const matches = textContent.match(pattern);
        if (matches && matches[0]) return matches[0];
      }
      
      const codeElements = document.querySelectorAll('[class*="pix"], [class*="qr"], [id*="pix"], [id*="qr"]');
      for (const el of codeElements) {
        const text = el.textContent || el.value || '';
        if (text.length > 20) return text;
      }
      
      return null;
    });
    
    if (!pixCode) {
      const shadowPix = await page.evaluate(() => {
        const elements = document.querySelectorAll('*');
        for (let el of elements) {
          if (el.shadowRoot) {
            const text = el.shadowRoot.textContent;
            const matches = text.match(/(?:00020126\d{20,}|[0-9]{32,}|[A-Z0-9]{32,})/g);
            if (matches && matches[0]) return matches[0];
          }
        }
        return null;
      });
      
      if (shadowPix) {
        state.lastPixCode = shadowPix;
        return { success: true, pixCode: shadowPix, strategy: 3 };
      }
    }
    
    if (pixCode) {
      state.lastPixCode = pixCode;
      return { success: true, pixCode, strategy: 3 };
    }
    
    return { success: false, strategy: 3 };
  } catch (error) {
    console.error('❌ Erro na Estratégia 3:', error.message);
    return { success: false, strategy: 3, error: error.message };
  }
}

// Estratégia 4: Interceptar resposta da API de depósito
async function strategy4_intercept_pix(email, password, valor, identificador) {
  console.log('🎯 Estratégia 4: Interceptar resposta da API de depósito');
  
  try {
    if (!state.page) {
      await strategy1_login(email, password);
    }
    
    const page = state.page;
    const pixCodes = [];
    
    const responseHandler = async (response) => {
      try {
        const url = response.url();
        if (url.includes('deposit') || url.includes('pix') || url.includes('payment')) {
          const data = await response.json().catch(() => null);
          if (data) {
            const pixCode = data.pixCode || data.qrCode || data.code || data.pix || data.emv;
            if (pixCode) {
              pixCodes.push(pixCode);
              state.lastPixCode = pixCode;
            }
          }
        }
      } catch (error) {
        // Ignorar
      }
    };
    
    page.on('response', responseHandler);
    
    const depositResult = await page.evaluate(async ({ valor, identificador }) => {
      const endpoints = [
        '/api/deposit/pix',
        '/api/pix/generate',
        '/api/deposit',
        '/api/payment/pix',
        '/deposit/pix'
      ];
      
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              amount: valor, 
              value: valor,
              valor: valor,
              cpf: identificador,
              identifier: identificador
            })
          });
          
          if (response.ok) {
            return await response.json();
          }
        } catch (error) {
          continue;
        }
      }
      
      return null;
    }, { valor, identificador });
    
    if (depositResult && (depositResult.pixCode || depositResult.qrCode || depositResult.code)) {
      const pixCode = depositResult.pixCode || depositResult.qrCode || depositResult.code;
      state.lastPixCode = pixCode;
      return { success: true, pixCode, strategy: 4 };
    }
    
    await page.waitForTimeout(5000);
    
    if (pixCodes.length > 0) {
      state.lastPixCode = pixCodes[0];
      return { success: true, pixCode: pixCodes[0], strategy: 4 };
    }
    
    return { success: false, strategy: 4 };
  } catch (error) {
    console.error('❌ Erro na Estratégia 4:', error.message);
    return { success: false, strategy: 4, error: error.message };
  }
}

// ==========================================
// ROTA PRINCIPAL - Deve vir ANTES das outras
// ==========================================
app.get("/", (req, res) => {
  res.send("Backend online! Sistema de PIX funcionando.");
});

// Health Check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Servidor funcionando!",
    timestamp: new Date().toISOString()
  });
});

// Rota para screenshots de debug
app.get("/debug-screenshots", (req, res) => {
  try {
    const files = fs.readdirSync("screenshots");
    const screenshots = files.map(file => ({
      filename: file,
      url: `/screenshots/${file}`
    }));
    res.json({ 
      status: "ok", 
      screenshots 
    });
  } catch (error) {
    res.json({ 
      status: "erro", 
      screenshots: [], 
      error: error.message 
    });
  }
});

// Rota para gerar PIX
app.post("/deposito", async (req, res) => {
  try {
    const {
      valor,
      produto,
      sabor,
      quantidade,
      identificador,
      cliente,
      telefone,
      email,
      senha
    } = req.body;

    console.log("💰 Nova solicitação de PIX:");
    console.log({
      valor,
      produto,
      sabor,
      quantidade,
      identificador,
      cliente,
      telefone,
      email: email || 'não fornecido',
      senha: senha ? '***' : 'não fornecida'
    });

    if (!valor) {
      return res.status(400).json({
        status: "erro",
        message: "Valor é obrigatório"
      });
    }

    if (!email || !senha) {
      console.log("⚠️ Email/senha não fornecidos. Retornando PIX simulado.");
      return res.status(200).json({
        status: "ok",
        pix_code: "PIX_SIMULADO_" + Date.now(),
        message: "PIX simulado (forneça email/senha para PIX real)"
      });
    }

    if (state.processing) {
      return res.status(429).json({
        status: "erro",
        message: "Sistema ocupado. Aguarde alguns segundos."
      });
    }

    state.processing = true;

    try {
      const result1 = await strategy1_login(email, senha);
      console.log('📊 Estratégia 1:', result1.success ? '✅ Sucesso' : '❌ Falhou');

      const result2 = await strategy2_api_pix(email, senha, valor, identificador);
      if (result2.success) {
        state.processing = false;
        return res.status(200).json({
          status: "ok",
          pix_code: result2.pixCode,
          strategy: "API Direta",
          message: "PIX gerado com sucesso via API"
        });
      }
      console.log('📊 Estratégia 2: ❌ Falhou');

      const result3 = await strategy3_ui_pix(email, senha, valor, identificador);
      if (result3.success) {
        state.processing = false;
        return res.status(200).json({
          status: "ok",
          pix_code: result3.pixCode,
          strategy: "UI Automatizada",
          message: "PIX gerado com sucesso via interface"
        });
      }
      console.log('📊 Estratégia 3: ❌ Falhou');

      const result4 = await strategy4_intercept_pix(email, senha, valor, identificador);
      if (result4.success) {
        state.processing = false;
        return res.status(200).json({
          status: "ok",
          pix_code: result4.pixCode,
          strategy: "Interceptação",
          message: "PIX gerado com sucesso via interceptação"
        });
      }
      console.log('📊 Estratégia 4: ❌ Falhou');

      state.processing = false;
      return res.status(500).json({
        status: "erro",
        message: "Não foi possível gerar o PIX. Todas as estratégias falharam.",
        details: {
          estrategia1: result1.error || "Falhou",
          estrategia2: result2.error || "Falhou",
          estrategia3: result3.error || "Falhou",
          estrategia4: result4.error || "Falhou"
        }
      });

    } catch (error) {
      state.processing = false;
      console.error("❌ Erro geral:", error);
      return res.status(500).json({
        status: "erro",
        message: "Erro interno ao gerar PIX",
        error: error.message
      });
    }

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: "erro",
      message: "Erro interno do servidor."
    });
  }
});

// Inicialização
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔍 Debug screenshots: http://localhost:${PORT}/debug-screenshots`);
});