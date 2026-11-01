import { Button } from '@nexa/ui';
import { greet } from '@nexa/core';

export function App() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Nexa Web</h1>
      <p>{greet({ id: '1', email: 'a@b.com', name: 'Nexa', createdAt: new Date().toISOString() })}</p>
      <Button onClick={() => alert('clicked')}>Click me</Button>
    </main>
  );
}
