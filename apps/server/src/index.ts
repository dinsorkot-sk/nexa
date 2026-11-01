import express from 'express';
import { greet } from '@nexa/core';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/greet/:name', (req, res) => {
  res.json({ message: greet({ id: '1', email: 'a@b.com', name: req.params.name, createdAt: new Date().toISOString() }) });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`);
});
