# Pesquisa de satisfação da Pousada Brisa Serena

## Executar
1. Instale o Node.js 18 ou superior.
2. Abra o terminal nesta pasta.
3. Execute `npm install`.
4. Execute `npm start`.
5. Acesse `http://localhost:3000`.

As respostas são gravadas no arquivo `respostas.db`.
Para consultar em JSON, acesse `http://localhost:3000/api/respostas`.

## Antes de publicar
- Restrinja ou remova a rota GET `/api/respostas`, pois no exemplo ela não possui autenticação.
- Use HTTPS e controle de acesso administrativo.
- Inclua aviso de privacidade, finalidade e prazo de retenção.
- Evite dados pessoais ou sensíveis se eles não forem necessários.
- Faça backup e limite o acesso ao arquivo do banco.
