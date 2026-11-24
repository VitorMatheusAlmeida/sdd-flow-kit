import { api } from '@/lib/api';

export default async function EnrollmentsPage() {
  const list = await api.get('/enrollments');
  return <main>{list.length}</main>;
}
