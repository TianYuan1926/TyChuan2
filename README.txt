使用说明（稳定基座 v4，已预置你的 Supabase）
1) 把整个压缩包解压，上传到你的 GitHub Pages 仓库根目录（Public 仓库）。
2) 打开 config.html：看到已经填入：
   - URL: https://wbvwdqgkgopjqmxeibrf.supabase.co
   - anon key: 以 eyJ… 开头（已写入浏览器）
   如需更改可修改后“保存”。
3) 打开 app.html：注册/登录 → 新增交易（标的/数量/价格/时间必填）→ 列表出现记录。
4) 若保存失败：到 Supabase → SQL Editor，执行 ensure_tx.sql 一次（幂等、安全）。
