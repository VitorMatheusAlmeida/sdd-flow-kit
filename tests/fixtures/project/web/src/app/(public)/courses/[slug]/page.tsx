import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export default function CoursePage({ price }: { price: number }) {
  const enroll = () => toast.success('Inscrição feita');
  return (
    <main className="container">
      <h1>Detalhes Do Curso</h1>
      <p>Nao foi possivel carregar o curso.</p>
      <span>R$ {price.toFixed(2)}</span>
      <Link href="/enrollments"><Button onClick={enroll}>Inscrever</Button></Link>
    </main>
  );
}
