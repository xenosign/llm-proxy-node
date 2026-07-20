# llm-proxy-node

하나의 OpenAI API 키를 여러 팀이 나눠 쓸 수 있도록 하는 프록시 서버. 팀별 전용 토큰을 발급하고, 팀별 누적 사용 금액($)과 예산($)을 Supabase에서 관리한다. 토큰 수도 함께 누적 기록되어 사용량 화면에서 금액과 토큰을 같이 확인할 수 있다.

## 동작 방식

- 팀은 실제 OpenAI 키 대신 발급받은 `proxy_token`을 `Authorization: Bearer <proxy_token>`으로 사용
- 서버가 토큰을 검증하고, 허용된 모델인지, 예산($) 초과 여부를 확인한 뒤, 실제 `OPENAI_API_KEY`로 바꿔서 OpenAI에 요청을 전달 (`/api/*` 전체 pass-through, 내부적으로 OpenAI의 `/v1/*` 경로로 재작성)
- 요청/응답 모두 OpenAI API와 동일한 형식을 유지한다: 요청 헤더는 `Authorization`만 실제 키로 치환하고 나머지는 그대로 전달, 응답도 상태 코드·바디·헤더를 그대로 돌려준다. 에러 응답(401/404/429)도 OpenAI의 `{ error: { message, type, param, code } }` 포맷을 따른다. 따라서 나중에 프록시를 걷어내고 클라이언트의 `baseURL`을 `https://api.openai.com`으로, `apiKey`를 실제 OpenAI 키로 바꾸고 경로를 `/v1/*`로 되돌리면 별도 코드 수정 없이 동작한다
- 스트리밍(`stream: true`) 요청도 SSE로 그대로 전달하며, 완료 시 응답의 `usage`(입력/출력 토큰 수)와 모델명을 바탕으로 `MODEL_PRICING` 요금표로 비용을 계산해 팀의 누적 금액과 토큰 수에 함께 반영

쿼터는 소프트 리밋이다: 사용 금액은 OpenAI 응답을 받아야 알 수 있으므로 매 요청 전에는 현재 누적 금액만 확인한다. 따라서 한 번의 요청이 예산을 약간 초과할 수 있고, 그 다음 요청부터 차단된다.

## 요금 계산

모델별 단가(입력/출력 토큰 1M당 USD)는 `src/config/env.js`의 기본값을 사용하며, `MODEL_PRICING` 환경변수(JSON)로 추가하거나 덮어쓸 수 있다. `ALLOWED_MODELS`에 있는 모든 모델은 단가가 설정되어 있어야 하며, 없으면 서버가 시작 시 에러를 낸다. OpenAI 공식 요금과 다를 수 있으니 [pricing 페이지](https://openai.com/api/pricing)를 확인하고 필요하면 `MODEL_PRICING`으로 갱신한다.

## 모델 제한

`ALLOWED_MODELS` 환경변수(콤마 구분, 기본값 `gpt-5-nano,gpt-4o-mini`)에 없는 모델을 요청하면 OpenAI가 실제로 존재하지 않는 모델을 호출했을 때와 동일한 404 `model_not_found` 에러를 반환한다.

## 설정

1. Supabase 프로젝트를 만들고 SQL 에디터에서 [`supabase/schema.sql`](supabase/schema.sql) 실행
2. `.env.example`을 `.env`로 복사하고 값 채우기
   - `OPENAI_API_KEY`: 실제 OpenAI 키 (클라이언트에는 절대 노출하지 않음)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: Supabase 프로젝트 설정 > API에서 확인
   - `JWT_SECRET`: 대시보드 로그인 세션 서명용 임의의 긴 문자열
   - `MODEL_PRICING` (선택): 모델별 단가를 기본값에서 바꾸거나 추가할 때만 설정
3. `npm install`

기존에 `token_budget` 기반으로 운영 중이던 프로젝트라면, `schema.sql`을 다시 실행하면 `token_budget` 컬럼이 삭제되고 `budget_usd`/`cost_used`가 0으로 추가된다. 토큰 수는 모델별 단가 이력이 없어 금액으로 자동 환산할 수 없으므로, 재실행 후 Admin 페이지에서 각 팀의 `budget_usd`를 다시 설정해야 한다.

## 팀 계정 발급

```
node scripts/create-team.js "TeamA" 50 teamA "s3cret-pw"
```

이름, 예산($), 대시보드 로그인 아이디, 비밀번호를 받아 팀을 생성하고 API용 `proxy_token`과 대시보드 로그인 정보를 출력한다. `proxy_token`은 해당 팀의 API 클라이언트에, `login_id`/비밀번호는 대시보드 로그인용으로 팀에게 전달한다.

## 사용량 대시보드

`/dashboard/login.html`에서 팀 아이디/비밀번호로 로그인하면 `/dashboard/`에서 해당 팀의 사용 금액($)·예산($)·잔여 예산과 누적 토큰 수를 함께 볼 수 있다. 로그인 세션은 httpOnly 쿠키에 저장된 JWT로 관리되며(서버 쪽 세션 저장소 불필요), 매 조회 시 Supabase에서 최신 사용량을 다시 읽어온다.

## Admin 페이지

```
node scripts/create-admin.js admin "adm1n-pw"
```

admin 계정(`login_id`/비밀번호)을 생성한다. `/admin/login.html`에서 로그인하면 `/admin/`에서 전체 팀의 사용량 요약(전체 예산 대비 사용 금액, 누적 토큰)과 팀별 사용량 테이블(금액+토큰)을 볼 수 있고, 각 팀의 로그인 아이디/비밀번호/예산($)을 바로 수정할 수 있다.

admin 계정은 team 계정과 완전히 분리된 별도 Supabase `admins` 테이블에 저장되고, 세션 쿠키도 이름이 달라(`admin_session` vs `session`) 서로 섞이지 않는다. 팀 생성/삭제나 `proxy_token` 재발급은 admin 페이지에서 다루지 않으며 `scripts/create-team.js`로만 처리한다.

## 실행

```
npm run dev   # nodemon
npm start     # production
```

## 사용 예시

```
curl https://<서버 주소>/api/chat/completions \
  -H "Authorization: Bearer <team-proxy-token>" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}'
```

팀 클라이언트는 OpenAI 공식 SDK를 그대로 쓰되 `baseURL`을 이 프록시 주소로, `apiKey`를 팀의 `proxy_token`으로 설정하면 된다.

## 배포 (클라우드타입)

클라우드타입은 영구 디스크를 지원하지 않으므로 상태는 전부 Supabase에 있다. Node 단일 서비스로 배포하면 되며, 환경변수(`OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `PORT`)만 설정하면 된다. 대시보드 로그인 쿠키에 `secure` 속성이 붙으려면 `NODE_ENV=production`도 함께 설정한다.
