delete from public.attacks
where id = 'aes-biclique-full'
   or algorithm_id = 'aes-128-192-256';

delete from public.algorithms
where id = 'aes-128-192-256';
