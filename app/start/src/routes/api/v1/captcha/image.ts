import { createFileRoute } from '@tanstack/react-router';
import { createCommentImageCaptcha } from '@backend/services/comment-captcha';
import { requestIp } from '@backend/request-ip';
import { apiOk, withPublicWrite } from '../../../../server/http';

export const Route = createFileRoute('/api/v1/captcha/image')({
  server: { handlers: { GET: ({ request }) => withPublicWrite(async () => {
    return apiOk(await createCommentImageCaptcha(requestIp(request)));
  }) } },
});
