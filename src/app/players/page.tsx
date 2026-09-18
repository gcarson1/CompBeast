import { redirect } from 'next/navigation';

/** Players are browsed per season now. */
export default function PlayersPage() {
  redirect('/seasons');
}
