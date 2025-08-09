使用说明（稳定基座 v3）
1) 解压本包，全部文件上传到你的 GitHub Pages 仓库根目录。
2) 访问 config.html，粘贴 Supabase Project URL 与 anon public key，保存。
3) 访问 app.html：注册/登录 → 新增交易（标的/数量/价格/时间）→ 表格中可见、可删除。
4) 若保存失败：Supabase → SQL Editor → 运行 ensure_tx.sql 一次（幂等）。
