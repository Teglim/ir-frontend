import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// 機種データの型定義（TypeScriptの機能）
type Game = {
  id: string;
  name: string;
};

export default function Home() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 画面が表示された時に、Supabaseからgamesテーブルのデータを取得する
    const fetchGames = async () => {
      const { data, error } = await supabase
        .from('games')
        .select('*')
        .order('sort_order'); // sort_orderの順に並び替え
      
      if (error) {
        console.error('取得エラー:', error);
      } else {
        setGames(data || []);
      }
      setLoading(false);
    };

    fetchGames();
  }, []);

  if (loading) return <div className="text-center p-8">読み込み中...</div>;

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-3xl font-bold text-center mb-8">おとげーせん IR</h1>
      
      <div className="grid gap-4">
        {games.map((game) => (
          <Link
            key={game.id}
            to={`/games/${game.id}`}
            className="block p-6 bg-white border border-gray-200 rounded-lg shadow hover:bg-gray-50 transition"
          >
            <h2 className="text-2xl font-bold text-center text-gray-800">
              {game.name}
            </h2>
          </Link>
        ))}
      </div>
    </div>
  );
}
