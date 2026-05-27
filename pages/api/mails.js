import { supabase } from '../../lib/supabase';
 
export default async function handler(req, res) {
  // =========================
  // DELETE (削除処理)
  // =========================
  if (req.method === 'DELETE') {
    const { id } = req.query;
 
    if (!id) {
      return res.status(400).json({ error: 'IDは必須です' });
    }
 
    try {
      // 1. 実際のテーブル構造に合わせて、projects_id と file_url を取得
      const { data: attachments, error: fetchError } = await supabase
        .from('attachments')
        .select('file_url')
        .eq('attachments.projects_id', id); // 画像のキー名「attachments.projects_id」に修正
 
      if (fetchError) {
        console.warn('attachmentsテーブルの取得をスキップしました（存在しないか設定されていません）:', fetchError.message);
      } else if (attachments && attachments.length > 0) {
        // 2. 紐づくファイルがストレージにあれば削除
        const fileNames = attachments.map(file => {
          // file_url からファイル名部分を抽出
          const urlParts = file.file_url.split('/');
          return urlParts[urlParts.length - 1];
        });
 
        const { error: storageError } = await supabase
          .storage
          .from('FILES')
          .remove(fileNames);
 
        if (storageError) {
          console.error('Storage deletion failed:', storageError);
        }
      }
 
      // 3. プロジェクトを削除（ここが本命の処理です）
      const { error: projectDeleteError } = await supabase
        .from('projects')
        .delete()
        .eq('id', id);
 
      if (projectDeleteError) throw projectDeleteError;
 
      return res.status(200).json({ message: '削除成功' });
 
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }
 
  // =========================
  // GET (取得処理)
  // =========================
  if (req.method === 'GET') {
    // ✨ 変更ポイント: projects を取得する際、紐づく attachments（ファイル名、URL）もまとめて一発で取得する
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        attachments (
          id,
          file_name,
          file_url
        )
      `)
      .order('created_at', { ascending: false });
 
    if (error) {
      return res.status(500).json({ data: null, error: error.message });
    }
 
    return res.status(200).json({ data, error: null });
  }
 
  return res.status(405).json({ error: 'Method Not Allowed' });
}