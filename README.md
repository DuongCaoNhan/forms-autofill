# forms-autofill

Tự điền một Microsoft Forms theo đáp án trong `answers.json` rồi nộp, chạy được nhiều lần liền.

## Cài đặt

Cần Node.js 18 trở lên và Microsoft Edge (có sẵn trên Windows, nên không phải tải trình duyệt).

```bash
npm install
```

## Chạy

| Lệnh | Việc làm |
|---|---|
| `npm run test-once` | Chạy thử: điền một lần, **không nộp**, để cửa sổ Edge mở cho bạn kiểm tra |
| `npm run run` | Điền và **nộp** một lần |
| `node form-fill.mjs --runs 10` | Điền và nộp 10 lần liền |
| `node form-fill.mjs --url "<link form>"` | Dùng link khác với link trong `answers.json` |
| `node form-fill.mjs --answers khac.json` | Dùng file đáp án khác |

Có thể ghép các tuỳ chọn, ví dụ `node form-fill.mjs --answers khac.json --runs 5`.

Nên chạy `test-once` trước, xem form điền đúng chưa, rồi mới nộp thật. Form đã nộp thì không rút lại được.

## Viết `answers.json`

```json
{
  "url": "https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=...",
  "answers": [
    { "question": "Chọn button Reset", "answer": "초기화" },
    { "question": "Chọn button Ban", "answer": ["밴", "금지"] },
    { "question": "Vui lòng ghi Account PM của bạn", "answer": "TenCuaBan" }
  ]
}
```

- **`url`**: link mở form.
- **`question`**: tiêu đề câu hỏi trên form. Thứ tự trong file không quan trọng, vì script khớp đáp án theo tiêu đề, kể cả khi form xáo trộn câu hỏi. Không cần chép đủ tiêu đề: một đoạn nằm trong tiêu đề là đủ. Script bỏ qua số thứ tự, dấu `*`, khoảng trắng thừa và chữ hoa/thường.
- **`answer`**:
  - Câu chọn đáp án: ghi **đúng y chữ trên lựa chọn**, kể cả dấu cách (ví dụ `"강제 종료"`).
  - Câu tự luận: ghi chữ cần gõ vào ô.
  - Câu nhiều đáp án: dùng mảng `["A", "B"]`. Với câu checkbox ("chọn nhiều đáp án"), script tick hết. Với câu chỉ chọn một, script chọn đáp án đầu tiên trong mảng mà form có.
  - `null`: bỏ trống câu đó.
- Dòng nào cũng có dấu phẩy ở cuối, trừ dòng cuối cùng trong mảng `"answers"`.

Kiểu cũ vẫn chạy: `"answers"` là danh sách đáp án theo đúng thứ tự câu hỏi trên form, ví dụ `["B", "Nội dung", ["A", "C"], null]`. Kiểu này thì `"B"` là lựa chọn thứ hai, nếu không có lựa chọn nào tên đúng là "B". Không dùng được kiểu này khi form xáo trộn câu hỏi.

## Lưu ý

- **Đăng nhập**: nếu form bắt đăng nhập, bạn đăng nhập trong cửa sổ Edge script mở ra. Script chờ đến khi form hiện. Phiên đăng nhập được lưu trong thư mục `.profile`, nên lần sau không phải đăng nhập lại.
- **Trang bìa**: nếu form mở ra trang có nút "Click to start" (hoặc nút khác có chữ "start"), script tự bấm nút đó rồi mới điền.
- **Đóng cửa sổ Edge trước khi chạy lần tiếp theo.** Còn cửa sổ của lần trước thì script báo `Không mở được Edge` và dừng.
- **Script dừng và không nộp khi:**
  - Form có câu hỏi không khớp `question` nào trong file. Lỗi ghi `no matching "question"`: thêm câu đó vào `answers.json`.
  - Đáp án không có trên form. Lỗi ghi `No option "..."` hoặc `None of [...] is an option`: sửa chữ cho khớp với lựa chọn trên form.
- Script không biết đáp án nào đúng. Nó chỉ chọn những gì bạn ghi trong file.
