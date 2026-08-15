import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import imageCompression from 'browser-image-compression';
import toast from 'react-hot-toast';

type Song = { id: string; name: string };
type Group = { id: string; name: string; songs: Song[] };
type MySub = { id: string; score: number; created_at: string; song_id: string; image_url: string | null };

const getFilePathFromUrl = (url: string) => {
  const parts = url.split('/results/');
  return parts.length > 1 ? parts[1] : null;
};

function formatScore(scoreNumber: number, decimalPlaces?: number, suffix?: string) {
  const safeDecimals = decimalPlaces || 0;
  const safeSuffix = suffix || "";
  const formattedNumber = Number(scoreNumber).toLocaleString(undefined, {
    minimumFractionDigits: safeDecimals,
    maximumFractionDigits: safeDecimals,
  });
  return `${formattedNumber}${safeSuffix}`;
}

export default function Submit() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  
  const [gameConfig, setGameConfig] = useState({ decimalPlaces: 0, suffix: '' });
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [playerName, setPlayerName] = useState(localStorage.getItem('playerName') || '');
  const [inputs, setInputs] = useState<Record<string, { score: string; file: File | null }>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mySubmissions, setMySubmissions] = useState<MySub[]>([]);

  useEffect(() => {
    const fetchGroups = async () => {
      const { data: gameData } = await supabase.from('games').select('decimal_places, suffix').eq('id', gameId).single();
      if (gameData) setGameConfig({ decimalPlaces: gameData.decimal_places, suffix: gameData.suffix });
      const { data } = await supabase
        .from('groups')
        .select(`id, name, songs(id, name)`)
        .eq('game_id', gameId)
        .order('sort_order');
      
      if (data && data.length > 0) {
        setGroups(data as unknown as Group[]);
        setSelectedGroupId(data[0].id);
      }
    };
    if (gameId) fetchGroups();
  }, [gameId]);

  const fetchMySubmissions = useCallback(async () => {
    if (!playerName || groups.length === 0) return;
    
    const { data: player } = await supabase.from('players').select('id').eq('name', playerName).single();
    if (!player) {
      setMySubmissions([]);
      return;
    }

    const songIds = groups.flatMap(g => g.songs.map(s => s.id));
    if (songIds.length === 0) return;

    const { data: subs } = await supabase
      .from('submissions')
      .select('id, score, created_at, song_id, image_url')
      .eq('player_id', player.id)
      .in('song_id', songIds)
      .order('created_at', { ascending: false })
      .limit(10);
      
    if (subs) setMySubmissions(subs);
  }, [playerName, groups]);

  useEffect(() => {
    fetchMySubmissions();
  }, [fetchMySubmissions]);

  const handleDelete = async (submissionId: string) => {
    if (!window.confirm('本当にこのスコアを削除しますか？')) return;

    const toastId = toast.loading('削除しています...');

    const subToDelete = mySubmissions.find(s => s.id === submissionId);
    if (subToDelete?.image_url) {
      const path = getFilePathFromUrl(subToDelete.image_url);
      if (path) await supabase.storage.from('results').remove([path]);
    }

    const { error } = await supabase.from('submissions').delete().eq('id', submissionId);
    
    if (error) {
      toast.error('削除に失敗しました', { id: toastId });
      console.error(error);
    } else {
      toast.success('スコアを削除しました', { id: toastId });
      fetchMySubmissions();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) {
      toast.error('プレイヤー名を入力してください');
      return;
    }
    
    setIsSubmitting(true);
    localStorage.setItem('playerName', playerName);
    
    const toastId = toast.loading('スコアを送信しています...');

    try {
      let playerId = '';
      const { data: existingPlayer } = await supabase.from('players').select('id').eq('name', playerName).single();

      if (existingPlayer) {
        playerId = existingPlayer.id;
      } else {
        const { data: newPlayer, error } = await supabase.from('players').insert({ name: playerName }).select('id').single();
        if (error) throw error;
        playerId = newPlayer.id;
      }

      for (const songId in inputs) {
        const input = inputs[songId];
        if (!input.score) continue;

        let imageUrl = null;
        if (input.file) {
          const { data: oldSubs } = await supabase
            .from('submissions')
            .select('id, image_url')
            .eq('player_id', playerId)
            .eq('song_id', songId)
            .not('image_url', 'is', null);

          if (oldSubs && oldSubs.length > 0) {
            const pathsToRemove = oldSubs.map(s => getFilePathFromUrl(s.image_url!)).filter(Boolean) as string[];
            if (pathsToRemove.length > 0) await supabase.storage.from('results').remove(pathsToRemove);
            await supabase.from('submissions').update({ image_url: null }).in('id', oldSubs.map(s => s.id));
          }

          const options = {
            maxSizeMB: 0.3,
            maxWidthOrHeight: 1280,
            useWebWorker: true,
          };
          
          const compressedFile = await imageCompression(input.file, options);
          const fileExt = compressedFile.name.split('.').pop() || 'jpg';
          const fileName = `${Math.random()}.${fileExt}`;
          const filePath = `${playerId}/${fileName}`;
          
          const { error: uploadError } = await supabase.storage.from('results').upload(filePath, compressedFile);
            
          if (!uploadError) {
            const { data } = supabase.storage.from('results').getPublicUrl(filePath);
            imageUrl = data.publicUrl;
          }
        }

        await supabase.from('submissions').insert({
          player_id: playerId,
          song_id: songId,
          score: parseFloat(input.score),
          image_url: imageUrl
        });
      }

      toast.success('スコアを送信しました！', { id: toastId });
      navigate(`/games/${gameId}`);
      
    } catch (error) {
      console.error(error);
      toast.error('エラーが発生しました', { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedGroup = groups.find(g => g.id === selectedGroupId);
  const allSongs = groups.flatMap(g => g.songs);

  return (
    <div className="max-w-2xl mx-auto p-4 pb-24 text-gray-100">
      <Link to={`/games/${gameId}`} className="text-blue-400 hover:text-blue-300 hover:underline mb-6 inline-block">← ランキングに戻る</Link>
      <h1 className="text-2xl font-bold mb-6 tracking-wide">スコア提出</h1>

      <form onSubmit={handleSubmit} className="space-y-6 bg-gray-800 p-6 rounded-lg shadow-xl border border-gray-700">
        <div>
          <label className="block text-sm font-bold text-gray-300 mb-1">プレイヤー名</label>
          <input 
            type="text" required
            className="w-full border border-gray-600 p-2 rounded bg-gray-900 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            placeholder="ランキングに表示される名前"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-300 mb-1">対象グループ</label>
          <select 
            className="w-full border border-gray-600 p-2 rounded bg-gray-900 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
            value={selectedGroupId}
            onChange={e => setSelectedGroupId(e.target.value)}
          >
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>

        {selectedGroup && (
          <div className="space-y-4 mt-6 border-t border-gray-700 pt-6">
            <p className="text-sm font-bold text-blue-400 mb-4">※ 更新したい曲だけ入力してください（空欄は無視されます）</p>
            {selectedGroup.songs.map(song => (
              <div key={song.id} className="p-4 border border-gray-700 rounded bg-gray-900/50">
                <h3 className="font-bold text-lg mb-3 text-gray-200">{song.name}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">スコア</label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number"
                        step={gameConfig.decimalPlaces > 0 ? String(1 / Math.pow(10, gameConfig.decimalPlaces)) : "1"}
                        className="w-full border border-gray-600 p-2 rounded bg-gray-900 text-white outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                        placeholder="スコアを入力"
                        value={inputs[song.id]?.score || ''}
                        onChange={e => setInputs(prev => ({ ...prev, [song.id]: { ...prev[song.id], score: e.target.value } }))}
                      />
                      {gameConfig.suffix && <span className="font-bold text-gray-400">{gameConfig.suffix}</span>}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">リザルト画像 (任意)</label>
                    <input 
                      type="file" accept="image/*"
                      className="w-full text-sm p-1.5 text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gray-700 file:text-blue-400 hover:file:bg-gray-600 transition-colors"
                      onChange={e => setInputs(prev => ({ ...prev, [song.id]: { ...prev[song.id], file: e.target.files?.[0] || null } }))}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <button 
          type="submit" disabled={isSubmitting}
          className="w-full bg-blue-600 text-white font-bold py-4 rounded-lg shadow-lg hover:bg-blue-500 transition-colors disabled:opacity-50 mt-8"
        >
          {isSubmitting ? '送信中...' : '提出する'}
        </button>
      </form>

      {mySubmissions.length > 0 && (
        <div className="mt-12 bg-gray-800 p-6 rounded-lg shadow-xl border border-gray-700">
          <h2 className="text-xl font-bold mb-4 text-white">自分の提出履歴（最新10件）</h2>
          <ul className="space-y-3">
            {mySubmissions.map(sub => {
              const songName = allSongs.find(s => s.id === sub.song_id)?.name || '不明な曲';
              const dateObj = new Date(sub.created_at);
              const dateStr = `${dateObj.getMonth() + 1}/${dateObj.getDate()} ${dateObj.getHours()}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
              
              return (
                <li key={sub.id} className="flex justify-between items-center border-b border-gray-700/50 pb-3">
                  <div>
                    <p className="font-bold text-gray-200">{songName}</p>
                    <p className="text-xs text-gray-500">{dateStr}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    {sub.image_url && <span className="text-xs bg-blue-900/40 text-blue-400 border border-blue-800/50 px-2 py-0.5 rounded">画像あり</span>}
                    <span className="font-mono text-lg font-bold text-gray-300">
                      {formatScore(sub.score, gameConfig.decimalPlaces, gameConfig.suffix)}
                    </span>
                    <button 
                      onClick={() => handleDelete(sub.id)} 
                      className="text-sm text-red-400 hover:bg-red-900/30 px-3 py-1.5 rounded transition-colors"
                    >
                      削除
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
