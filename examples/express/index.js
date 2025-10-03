const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send('Hello World from {{PQS:projectName}}!');
});

app.listen(port, () => {
  console.log(`{{PQS:projectName}} listening at http://localhost:${port}`);
});
