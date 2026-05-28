import { supabase } from '../../lib/supabase';

export default async function handler(req, res) {
  // ==========================================
  // DELETE (プロジェクトおよび紐づく添付ファイルの削除)
  // ==========================================
  if (req.method === 'DELETE') {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'IDは必須です' });
    }

    try {
      // 1. attachments テーブルから紐づくファイルURLを取得
      const { data: attachments, error: fetchError } = await supabase
        .from('attachments')
        .select('file_url')
        .eq('projects_id', id);

      if (fetchError) {
        console.warn('attachmentsテーブルの取得をスキップしました:', fetchError.message);
      } else if (attachments && attachments.length > 0) {
        // 2. 紐づくファイルがストレージにあれば一括削除
        const fileNames = attachments.map(file => {
        if (!file.file_url) return null;
        // URLからファイルパスを正しく抽出する（例: https://.../FILES/folder/my-file.txt -> folder/my-file.txt）
        return file.file_url.split('/FILES/')[1]; 
        }).filter(Boolean);

        if (fileNames.length > 0) {
          const { error: storageError } = await supabase
            .storage
            .from('FILES')
            .remove(fileNames);

          if (storageError) {
            console.error('Storage deletion failed:', storageError);
          }
        }
      }

      // 3. プロジェクト本体を削除
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

  // ==========================================
  // GET (プロジェクトと添付ファイル一覧の結合取得)
  // ==========================================
  if (req.method === 'GET') {
    try {
      // フロントエンドからページ番号を受け取る (例: /api/projects?page=0)
      // 指定がなければ 0 ページ目とする
      const page = parseInt(req.query.page) || 0;
      const pageSize = 1000;
      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          attachments!attachments_projects_id_fkey (
            id,
            file_name,
            file_url
          )
        `)
        .order('created_at', { ascending: false })
        .range(from, to); // 👈 1,000件ずつ範囲を指定して取得

      if (error) {
        return res.status(500).json({ data: null, error: error.message });
      }

      return res.status(200).json({ data, error: null });
    } catch (err) {
      return res.status(500).json({ data: null, error: err.message });
    }
  }

  // 許可されていないメソッドへの対応
  return res.status(405).json({ error: 'Method Not Allowed' });
}