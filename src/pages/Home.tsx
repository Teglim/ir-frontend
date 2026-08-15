import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type Game = {
  id: string;
  name: string;
};

export default function Home() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGames = async () => {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .order('sort_order');
      
      if (error) {
        console.error('取得エラー:', error);
      } else {
        setGames(data || []);
      }
      setLoading(false);
    };

    fetchGames();
  }, []);

  if (loading) return <div className="text-center p-8 text-gray-400">読み込み中...</div>;

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-4xl font-bold text-center mb-8 text-purple-400 tracking-wider drop-shadow-[0_0_15px_rgba(192,132,252,0.8)]">おとげーせん IR</h1>
      
      <div className="grid gap-4">
        {games.map((game) => (
          <Link
            key={game.id}
            to={`/games/${game.id}`}
            className="block p-6 bg-gray-800 border border-gray-700 rounded-lg shadow-lg hover:bg-gray-700 transition duration-200"
          >
            <h2 className="text-2xl font-bold text-center text-gray-100 tracking-wide">
              {game.name}
            </h2>
          </Link>
        ))}
      </div>
    </div>
  );
}
