# llm-proxy-node

하나의 OpenAI API 키를 여러 팀이 나눠 쓸 수 있도록 하는 프록시 서버. 팀별 전용 토큰을 발급하고, 팀별 누적 토큰 사용량과 예산(고정 총량)을 Supabase에서 관리한다.

## 동작 방식

- 팀은 실제 OpenAI 키 대신 발급받은 `proxy_token`을 `Authorization: Bearer <proxy_token>`으로 사용
- 서버가 토큰을 검증하고, 허용된 모델인지, 예산 초과 여부를 확인한 뒤, 실제 `OPENAI_API_KEY`로 바꿔서 OpenAI에 요청을 전달 (`/v1/*` 전체 pass-through)
- 요청/응답 모두 OpenAI API와 동일한 형식을 유지한다: 요청 헤더는 `Authorization`만 실제 키로 치환하고 나머지는 그대로 전달, 응답도 상태 코드·바디·헤더를 그대로 돌려준다. 에러 응답(401/404/429)도 OpenAI의 `{ error: { message, type, param, code } }` 포맷을 따른다. 따라서 나중에 프록시를 걷어내고 클라이언트의 `baseURL`을 `https://api.openai.com`으로, `apiKey`를 실제 OpenAI 키로 바꾸기만 하면 별도 코드 수정 없이 동작한다
- 스트리밍(`stream: true`) 요청도 SSE로 그대로 전달하며, 완료 시 사용된 토큰 수를 팀 사용량에 누적

쿼터는 소프트 리밋이다: 사용량은 OpenAI 응답을 받아야 알 수 있으므로 매 요청 전에는 현재 누적치만 확인한다. 따라서 한 번의 요청이 예산을 약간 초과할 수 있고, 그 다음 요청부터 차단된다.

## 모델 제한

`ALLOWED_MODELS` 환경변수(콤마 구분, 기본값 `gpt-5-nano,gpt-4o-mini`)에 없는 모델을 요청하면 OpenAI가 실제로 존재하지 않는 모델을 호출했을 때와 동일한 404 `model_not_found` 에러를 반환한다.

## 설정

1. Supabase 프로젝트를 만들고 SQL 에디터에서 [`supabase/schema.sql`](supabase/schema.sql) 실행
2. `.env.example`을 `.env`로 복사하고 값 채우기
   - `OPENAI_API_KEY`: 실제 OpenAI 키 (클라이언트에는 절대 노출하지 않음)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: Supabase 프로젝트 설정 > API에서 확인
   - `JWT_SECRET`: 대시보드 로그인 세션 서명용 임의의 긴 문자열
3. `npm install`

## 팀 계정 발급

```
node scripts/create-team.js "TeamA" 1000000 teamA "s3cret-pw"
```

이름, 토큰 예산, 대시보드 로그인 아이디, 비밀번호를 받아 팀을 생성하고 API용 `proxy_token`과 대시보드 로그인 정보를 출력한다. `proxy_token`은 해당 팀의 API 클라이언트에, `login_id`/비밀번호는 대시보드 로그인용으로 팀에게 전달한다.

## 사용량 대시보드

`/dashboard/login.html`에서 팀 아이디/비밀번호로 로그인하면 `/dashboard/`에서 해당 팀의 토큰 사용량·예산·잔여량을 볼 수 있다. 로그인 세션은 httpOnly 쿠키에 저장된 JWT로 관리되며(서버 쪽 세션 저장소 불필요), 매 조회 시 Supabase에서 최신 사용량을 다시 읽어온다.

## Admin 페이지

```
node scripts/create-admin.js admin "adm1n-pw"
```

admin 계정(`login_id`/비밀번호)을 생성한다. `/admin/login.html`에서 로그인하면 `/admin/`에서 전체 팀의 사용량 요약(전체 사용 총량 대비 사용량)과 팀별 사용량 테이블을 볼 수 있고, 각 팀의 로그인 아이디/비밀번호/토큰 예산을 바로 수정할 수 있다.

admin 계정은 team 계정과 완전히 분리된 별도 Supabase `admins` 테이블에 저장되고, 세션 쿠키도 이름이 달라(`admin_session` vs `session`) 서로 섞이지 않는다. 팀 생성/삭제나 `proxy_token` 재발급은 admin 페이지에서 다루지 않으며 `scripts/create-team.js`로만 처리한다.

## 실행

```
npm run dev   # nodemon
npm start     # production
```

## 사용 예시

```
curl https://<서버 주소>/v1/chat/completions \
  -H "Authorization: Bearer <team-proxy-token>" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}'
```

팀 클라이언트는 OpenAI 공식 SDK를 그대로 쓰되 `baseURL`을 이 프록시 주소로, `apiKey`를 팀의 `proxy_token`으로 설정하면 된다.

## 배포 (클라우드타입)

클라우드타입은 영구 디스크를 지원하지 않으므로 상태는 전부 Supabase에 있다. Node 단일 서비스로 배포하면 되며, 환경변수(`OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `PORT`)만 설정하면 된다. 대시보드 로그인 쿠키에 `secure` 속성이 붙으려면 `NODE_ENV=production`도 함께 설정한다.
