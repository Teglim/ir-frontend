import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Plus } from 'lucide-react';

type Song = { id: string; name: string };
type Group = {
  id: string;
  name: string;
  borders: { name: string; score: number }[];
  is_ascending: boolean;
  songs: Song[];
};
type Ranking = { player_name: string; total_score: number };
type SubData = { song_id: string; score: number; image_url: string; players: { name: string } };

export default function Game() {
  const { gameId } = useParams();
  const [gameName, setGameName] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [rankings, setRankings] = useState<Record<string, Ranking[]>>({});
  const [bestImages, setBestImages] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data: gameData } = await supabase.from('games').select('name').eq('id', gameId).single();
      if (gameData) setGameName(gameData.name);

      const { data: groupsData } = await supabase
        .from('groups')
        .select(`id, name, borders, is_ascending, songs ( id, name )`)
        .eq('game_id', gameId)
        .order('sort_order');
      
      if (groupsData) setGroups(groupsData as unknown as Group[]);

      const { data: rankData } = await supabase.from('group_rankings').select('*');
      const { data: subsData } = await supabase
        .from('submissions')
        .select('song_id, score, image_url, players(name)')
        .not('image_url', 'is', null);

      const imagesMap: Record<string, Record<string, string>> = {};
      if (subsData && groupsData) {
        const subs = subsData as unknown as SubData[];
        const songToAscending: Record<string, boolean> = {};
        groupsData.forEach((g: any) => g.songs.forEach((s: any) => songToAscending[s.id] = g.is_ascending));
        const bestScores: Record<string, Record<string, number>> = {}; 

        subs.forEach(sub => {
          const pName = sub.players?.name;
          if (!pName) return;
          if (!bestScores[pName]) bestScores[pName] = {};
          if (!imagesMap[pName]) imagesMap[pName] = {};

          const isAsc = songToAscending[sub.song_id] || false;
          const currentBest = bestScores[pName][sub.song_id];
          const isNewBest = currentBest === undefined || 
                            (isAsc ? sub.score < currentBest : sub.score > currentBest);

          if (isNewBest) {
            bestScores[pName][sub.song_id] = sub.score;
            imagesMap[pName][sub.song_id] = sub.image_url;
          }
        });
        setBestImages(imagesMap);
      }

      if (rankData) {
        const ranksByGroup: Record<string, Ranking[]> = {};
        rankData.forEach((r) => {
          if (!ranksByGroup[r.group_id]) ranksByGroup[r.group_id] = [];
          ranksByGroup[r.group_id].push(r);
        });
        
        groupsData?.forEach(g => {
          if (ranksByGroup[g.id]) {
            ranksByGroup[g.id].sort((a, b) => {
              // nullエラー回避：値がない場合は0として計算
              const scoreA = a.total_score || 0;
              const scoreB = b.total_score || 0;
              return g.is_ascending ? scoreA - scoreB : scoreB - scoreA;
            });
          }
        });
        setRankings(ranksByGroup);
      }
      setLoading(false);
    };

    if (gameId) fetchData();
  }, [gameId]);

  if (loading) return <div className="text-center p-8">読み込み中...</div>;

  return (
    <div className="max-w-4xl mx-auto p-4 pb-24">
      <div className="mb-6">
        <Link to="/" className="text-blue-600 hover:underline mb-2 inline-block">← トップへ戻る</Link>
        <h1 className="text-3xl font-bold">{gameName} ランキング</h1>
      </div>

      <div className="space-y-12">
        {groups.map((group) => {
          const groupRankings = rankings[group.id] || [];
          const groupBorders = group.borders || [];

          type ListItem = 
            | { type: 'rank'; score: number; rankData: Ranking; originalIndex: number }
            | { type: 'border'; score: number; borderData: { name: string; score: number } };

          const listItems: ListItem[] = [
            // nullエラー回避：値がない場合は0とする
            ...groupRankings.map((r, i) => ({ type: 'rank' as const, score: r.total_score || 0, rankData: r, originalIndex: i })),
            ...groupBorders.map(b => ({ type: 'border' as const, score: b.score, borderData: b }))
          ];

          listItems.sort((a, b) => {
            if (a.score !== b.score) {
              return group.is_ascending ? a.score - b.score : b.score - a.score;
            }
            if (a.type === 'rank' && b.type === 'border') return -1;
            if (a.type === 'border' && b.type === 'rank') return 1;
            return 0;
          });

          return (
            <div key={group.id} className="bg-white rounded-lg shadow overflow-hidden">
              <div className="bg-gray-800 text-white px-4 py-3">
                <h2 className="text-xl font-bold">{group.name}</h2>
                <p className="text-sm text-gray-300">
                  対象曲: {group.songs.map(s => s.name).join(' / ')}
                </p>
              </div>
              
              <div className="p-4">
                {listItems.length > 0 ? (
                  <ul className="space-y-2">
                    {listItems.map((item, idx) => {
                      if (item.type === 'border') {
                        return (
                          <li key={`border-${idx}`} className="flex items-center gap-4 py-3 my-2 opacity-60">
                            <div className="flex-1 border-t-2 border-dashed border-gray-400"></div>
                            <span className="text-gray-600 font-bold text-sm tracking-widest">
                              {item.borderData.name} ({item.borderData.score.toLocaleString()})
                            </span>
                            <div className="flex-1 border-t-2 border-dashed border-gray-400"></div>
                          </li>
                        );
                      }

                      const rank = item.rankData;
                      const originalIdx = item.originalIndex;
                      const isTop3 = originalIdx < 3;
                      const playerImages = group.songs
                        .map(song => bestImages[rank.player_name]?.[song.id])
                        .filter(url => url);

                      return (
                        <li 
                          key={`rank-${originalIdx}`} 
                          className={`flex flex-col md:flex-row md:items-center justify-between border-b pb-3 pt-2 gap-4 ${
                            isTop3 ? 'bg-amber-50/40 -mx-4 px-4 rounded-lg' : ''
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <span className={`font-bold ${isTop3 ? 'text-2xl text-amber-600' : 'text-lg text-gray-600'}`}>
                              {originalIdx + 1}位
                            </span>
                            <span className={`font-bold ${isTop3 ? 'text-xl' : 'text-lg'}`}>
                              {rank.player_name}
                            </span>
                            <span className="font-mono text-xl ml-2 font-bold">
                              {/* nullエラー回避 */}
                              {(rank.total_score || 0).toLocaleString()}
                            </span>
                          </div>

                          {isTop3 && playerImages.length > 0 && (
                            <div className="flex gap-2 overflow-x-auto">
                              {playerImages.map((url, i) => (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                                  <img 
                                    src={url} 
                                    alt="リザルト" 
                                    className="h-16 md:h-20 w-auto object-cover rounded border border-gray-300 shadow-sm hover:opacity-80 transition-opacity" 
                                  />
                                </a>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-gray-500 text-center py-4">まだ提出がありません</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Link
        to={`/games/${gameId}/submit`}
        className="fixed bottom-8 right-8 bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 transition-transform hover:scale-105"
      >
        <Plus size={32} />
      </Link>
    </div>
  );
}