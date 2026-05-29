
import { supabaseAdmin } from '../../lib/supabaseAdmin';

export default async function handler(req, res) {

  // ==========================================
  // DELETE
  // ==========================================
  if (req.method === 'DELETE') {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'IDは必須です' });
    }

    try {

      // 1. 添付ファイル取得
      const { data: attachments, error: fetchError } = await supabaseAdmin
        .from('attachments')
        .select('file_url')
        .eq('attachments_id', id);

      if (fetchError) {
        console.error('attachments取得エラー:', fetchError);
      }

      // 2. Storage削除
      if (attachments?.length > 0) {

        const fileNames = attachments
          .map(file => {
            if (!file.file_url) return null;

            const parts = file.file_url.split('/storage/v1/object/public/FILES/');

            return parts[1];
          })
          .filter(Boolean);

        if (fileNames.length > 0) {

          const { error: storageError } = await supabaseAdmin
            .storage
            .from('FILES')
            .remove(fileNames);

          if (storageError) {
            console.error('Storage削除エラー:', storageError);
          }
        }
      }

      // 3. attachmentsテーブル削除
      const { error: attachmentDeleteError } = await supabaseAdmin
        .from('attachments')
        .delete()
        .eq('attachments_id', id);

      if (attachmentDeleteError) {
        console.error('attachments削除エラー:', attachmentDeleteError);
      }

      // 4. projects削除
      const { error: projectDeleteError } = await supabaseAdmin
        .from('projects')
        .delete()
        .eq('projects_id', id);

      if (projectDeleteError) {
        throw projectDeleteError;
      }

      return res.status(200).json({
        message: '削除成功'
      });

    } catch (err) {

      console.error('DELETE ERROR:', err);

      return res.status(500).json({
        error: err.message
      });
    }
  }

  // ==========================================
  // GET
  // ==========================================
  if (req.method === 'GET') {

    try {

      const page = parseInt(req.query.page) || 0;

      const pageSize = 1000;

      const from = page * pageSize;

      const to = from + pageSize - 1;
      const { data, error } = await supabaseAdmin
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
  .range(from, to);

      if (error) {

        console.error('GET ERROR:', error);

        return res.status(500).json({
          data: null,
          error: error.message
        });
      }

      return res.status(200).json({
        data,
        error: null
      });

    } catch (err) {

      console.error('SERVER ERROR:', err);

      return res.status(500).json({
        data: null,
        error: err.message
      });
    }
  }

  return res.status(405).json({
    error: 'Method Not Allowed'
  });
}

