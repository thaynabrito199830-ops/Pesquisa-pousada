const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const path = require('path');
const crypto = require('crypto');

const app = express();

const PORT = process.env.PORT || 3000;
const ADMIN_USER =
  process.env.ADMIN_USER || 'admin';

const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || 'troque-esta-senha';

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.randomBytes(32).toString('hex');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não foi configurada.');
  process.exit(1);
}

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

app.set('trust proxy', 1);
app.use(express.json({ limit: '20kb' }));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 60 * 1000
    }
  })
);

app.use(
  express.static(path.join(__dirname, 'public'))
);

/* PROTEÇÃO ADMINISTRATIVA */

const protegido = (req, res, next) => {
  if (req.session.admin) {
    return next();
  }

  return res.status(401).json({
    mensagem: 'Acesso não autorizado.'
  });
};

/* CRIAR TABELAS */

async function prepararBanco() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS acessos (
      id BIGSERIAL PRIMARY KEY,
      identificacao TEXT,
      nome TEXT NOT NULL,
      apelido TEXT NOT NULL,
      criado_em TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS respostas (
      id BIGSERIAL PRIMARY KEY,
      identificacao TEXT,
      nota INTEGER NOT NULL
        CHECK (nota BETWEEN 1 AND 5),
      limpeza INTEGER NOT NULL
        CHECK (limpeza BETWEEN 1 AND 5),
      atendimento INTEGER NOT NULL
        CHECK (atendimento BETWEEN 1 AND 5),
      recomendaria TEXT NOT NULL
        CHECK (recomendaria IN ('sim', 'nao')),
      comentario TEXT,
      criado_em TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

/* REGISTRAR PARTICIPANTE */

app.post('/api/entrada', async (req, res) => {
  try {
    const nome = String(req.body.nome || '')
      .trim()
      .slice(0, 120);

    const apelido = String(req.body.apelido || '')
      .trim()
      .slice(0, 80);

    if (!nome || !apelido) {
      return res.status(400).json({
        mensagem:
          'Preencha nome completo e apelido.'
      });
    }

    const identificacao = `${nome} (${apelido})`;

    const resultado = await db.query(
      `
        INSERT INTO acessos (
          identificacao,
          nome,
          apelido
        )
        VALUES ($1, $2, $3)
        RETURNING id
      `,
      [identificacao, nome, apelido]
    );

    req.session.participante = {
      id: resultado.rows[0].id,
      identificacao,
      nome,
      apelido
    };

    return res.status(201).json({
      mensagem: 'Entrada registrada.',
      id: resultado.rows[0].id
    });
  } catch (erro) {
    console.error(
      'Erro ao registrar participante:',
      erro
    );

    return res.status(500).json({
      mensagem:
        'Não foi possível registrar a entrada.'
    });
  }
});

/* PARTICIPANTE ATUAL */

app.get('/api/participante', (req, res) => {
  const participante = req.session.participante;

  if (!participante) {
    return res.json({
      identificado: false,
      identificacao: null,
      nome: null,
      apelido: null
    });
  }

  return res.json({
    identificado: true,
    identificacao: participante.identificacao,
    nome: participante.nome,
    apelido: participante.apelido
  });
});

/* REGISTRAR AVALIAÇÃO */

app.post('/api/respostas', async (req, res) => {
  try {
    const participante =
      req.session.participante;

    if (!participante) {
      return res.status(401).json({
        mensagem:
          'Identifique-se antes de responder.'
      });
    }

    const {
      nota,
      limpeza,
      atendimento,
      recomendaria,
      comentario = ''
    } = req.body;

    const valores = [
      nota,
      limpeza,
      atendimento
    ].map(Number);

    const notasInvalidas = valores.some(
      valor =>
        !Number.isInteger(valor) ||
        valor < 1 ||
        valor > 5
    );

    if (
      notasInvalidas ||
      !['sim', 'nao'].includes(recomendaria)
    ) {
      return res.status(400).json({
        mensagem:
          'Revise os campos obrigatórios.'
      });
    }

    const resultado = await db.query(
      `
        INSERT INTO respostas (
          identificacao,
          nota,
          limpeza,
          atendimento,
          recomendaria,
          comentario
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `,
      [
        participante.identificacao,
        ...valores,
        recomendaria,
        String(comentario)
          .trim()
          .slice(0, 1000)
      ]
    );

    return res.status(201).json({
      mensagem:
        'Obrigado! Sua opinião foi registrada.',
      id: resultado.rows[0].id
    });
  } catch (erro)
