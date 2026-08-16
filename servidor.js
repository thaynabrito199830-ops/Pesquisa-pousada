const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const db = new sqlite3.Database(path.join(__dirname, 'respostas.db'));

app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

db.run(`CREATE TABLE IF NOT EXISTS respostas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nota INTEGER NOT NULL CHECK(nota BETWEEN 1 AND 5),
  limpeza INTEGER NOT NULL CHECK(limpeza BETWEEN 1 AND 5),
  atendimento INTEGER NOT NULL CHECK(atendimento BETWEEN 1 AND 5),
  recomendaria TEXT NOT NULL CHECK(recomendaria IN ('sim','nao')),
  comentario TEXT,
  criado_em TEXT DEFAULT CURRENT_TIMESTAMP
)`);

app.post('/api/respostas', (req, res) => {
  const { nota, limpeza, atendimento, recomendaria, comentario = '' } = req.body;
  const numeros = [nota, limpeza, atendimento].map(Number);
  if (numeros.some(n => !Number.isInteger(n) || n < 1 || n > 5) || !['sim','nao'].includes(recomendaria)) {
    return res.status(400).json({ mensagem: 'Revise os campos obrigatórios.' });
  }
  const texto = String(comentario).trim().slice(0, 1000);
  db.run(
    `INSERT INTO respostas (nota, limpeza, atendimento, recomendaria, comentario)
     VALUES (?, ?, ?, ?, ?)`,
    [...numeros, recomendaria, texto],
    function (erro) {
      if (erro) return res.status(500).json({ mensagem: 'Não foi possível registrar a resposta.' });
      res.status(201).json({ mensagem: 'Obrigado! Sua opinião foi registrada.', id: this.lastID });
    }
  );
});

app.get('/api/respostas', (req, res) => {
  db.all(`SELECT id, nota, limpeza, atendimento, recomendaria, comentario, criado_em
          FROM respostas ORDER BY id DESC`, [], (erro, linhas) => {
    if (erro) return res.status(500).json({ mensagem: 'Não foi possível consultar as respostas.' });
    res.json(linhas);
  });
});

app.listen(3000, () => console.log('Abra http://localhost:3000'));
