const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const app = express();

const db = new sqlite3.Database(
  path.join(__dirname, 'respostas.db')
);

const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || 'troque-esta-senha';

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.randomBytes(32).toString('hex');

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

/* BANCO DE DADOS */

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS acessos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identificacao TEXT,
      nome TEXT,
      apelido TEXT,
      criado_em TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.all(
    'PRAGMA table_info(acessos)',
    [],
    (erro, colunas) => {
      if (erro) {
        console.error(
          'Erro ao verificar tabela acessos:',
          erro
        );
        return;
      }

      const nomesDasColunas =
        colunas.map(coluna => coluna.name);

      if (!nomesDasColunas.includes('nome')) {
        db.run(
          'ALTER TABLE acessos ADD COLUMN nome TEXT',
          erroAlteracao => {
            if (erroAlteracao) {
              console.error(
                'Erro ao adicionar coluna nome:',
                erroAlteracao
              );
            }
          }
        );
      }

      if (!nomesDasColunas.includes('apelido')) {
        db.run(
          'ALTER TABLE acessos ADD COLUMN apelido TEXT',
          erroAlteracao => {
            if (erroAlteracao) {
              console.error(
                'Erro ao adicionar coluna apelido:',
                erroAlteracao
              );
            }
          }
        );
      }
    }
  );

  db.run(`
    CREATE TABLE IF NOT EXISTS respostas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identificacao TEXT,
      nota INTEGER NOT NULL
        CHECK(nota BETWEEN 1 AND 5),
      limpeza INTEGER NOT NULL
        CHECK(limpeza BETWEEN 1 AND 5),
      atendimento INTEGER NOT NULL
        CHECK(atendimento BETWEEN 1 AND 5),
      recomendaria TEXT NOT NULL
        CHECK(recomendaria IN ('sim', 'nao')),
      comentario TEXT,
      criado_em TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

/* PROTEÇÃO ADMINISTRATIVA */

const protegido = (req, res, next) => {
  if (req.session.admin) {
    return next();
  }

  return res.status(401).json({
    mensagem: 'Acesso não autorizado.'
  });
};

/* REGISTRAR PARTICIPANTE */

app.post('/api/entrada', (req, res) => {
  const nome = String(req.body.nome || '')
    .trim()
    .slice(0, 120);

  const apelido = String(req.body.apelido || '')
    .trim()
    .slice(0, 80);

  if (!nome || !apelido) {
    return res.status(400).json({
      mensagem: 'Preencha nome completo e apelido.'
    });
  }

  const identificacao = `${nome} (${apelido})`;

  db.run(
    `
      INSERT INTO acessos (
        identificacao,
        nome,
        apelido
      )
      VALUES (?, ?, ?)
    `,
    [identificacao, nome, apelido],

    function (erro) {
      if (erro) {
        console.error(
          'Erro ao registrar acesso:',
          erro
        );

        return res.status(500).json({
          mensagem:
            'Não foi possível registrar a entrada.'
        });
      }

      req.session.participante = {
        id: this.lastID,
        identificacao,
        nome,
        apelido
      };

      return res.status(201).json({
        mensagem: 'Entrada registrada.',
        id: this.lastID
      });
    }
  );
});

/* CONSULTAR PARTICIPANTE ATUAL */

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

app.post('/api/respostas', (req, res) => {
  const participante = req.session.participante;

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
      mensagem: 'Revise os campos obrigatórios.'
    });
  }

  db.run(
    `
      INSERT INTO respostas (
        identificacao,
        nota,
        limpeza,
        atendimento,
        recomendaria,
        comentario
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      participante.identificacao,
      ...valores,
      recomendaria,
      String(comentario).trim().slice(0, 1000)
    ],

    function (erro) {
      if (erro) {
        console.error(
          'Erro ao registrar avaliação:',
          erro
        );

        return res.status(500).json({
          mensagem:
            'Erro ao registrar a avaliação.'
        });
      }

      return res.status(201).json({
        mensagem:
          'Obrigado! Sua opinião foi registrada.',
        id: this.lastID
      });
    }
  );
});

/* LOGIN ADMINISTRATIVO */

app.post('/api/login', (req, res) => {
  const usuario = String(req.body.usuario || '');
  const senha = String(req.body.senha || '');

  if (
    usuario === ADMIN_USER &&
    senha === ADMIN_PASSWORD
  ) {
    req.session.admin = true;

    return res.json({
      mensagem: 'Login realizado.'
    });
  }

  return res.status(401).json({
    mensagem: 'Usuário ou senha incorretos.'
  });
});

/* LOGOUT */

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({
      mensagem: 'Sessão encerrada.'
    });
  });
});

/* CONSULTAR AVALIAÇÕES */

app.get(
  '/api/respostas',
  protegido,
  (req, res) => {
    db.all(
      'SELECT * FROM respostas ORDER BY id DESC',
      [],
      (erro, resultados) => {
        if (erro) {
          console.error(
            'Erro ao consultar avaliações:',
            erro
          );

          return res.status(500).json({
            mensagem:
              'Erro ao consultar as avaliações.'
          });
        }

        return res.json(resultados);
      }
    );
  }
);

/* CONSULTAR ACESSOS */

app.get(
  '/api/acessos',
  protegido,
  (req, res) => {
    db.all(
      `
        SELECT
          id,
          identificacao,
          nome,
          apelido,
          criado_em
        FROM acessos
        ORDER BY id DESC
      `,
      [],
      (erro, resultados) => {
        if (erro) {
          console.error(
            'Erro ao consultar acessos:',
            erro
          );

          return res.status(500).json({
            mensagem:
              'Erro ao consultar os acessos.'
          });
        }

        return res.json(resultados);
      }
    );
  }
);

/* INICIAR SERVIDOR */

app.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      `Servidor ativo na porta ${PORT}`
    );
  }
);
