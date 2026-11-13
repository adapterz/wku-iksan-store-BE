# 개발용 의존성 보안 검토

관련: [BE #160](https://github.com/adapterz/wku-iksan-store-BE/issues/160) · 검토·테스트 재확인: 2026-11-13

## 이번 변경

**brace-expansion·Jest의 glob을 보완하고 nodemon을 Node.js 내장 watch로 대체했습니다.** 운영용 패치 #161과 별개이며 서비스 로직·운영용 의존성·DB·FE·배포 설정은 변경하지 않습니다.

| 대상 | 기존 → 변경 | 적용 방식 |
| --- | --- | --- |
| brace-expansion | 5.0.9 → 5.0.13 / 1.1.18 → 1.1.22 | 기존 호환 범위의 lock 버전 갱신 |
| Jest가 사용하는 glob | 10.5.0 → 14.0.5 | `glob@10.5.0`에만 한정한 override |
| 위 glob의 minimatch | 9.0.9 → 11.0.8 | glob 업데이트에 따른 의존성 갱신 |
| nodemon → minimatch 10.2.5 | 제거 | `npm run dev`를 `node --watch app.js`로 변경 |

- glob 변경으로 기존 brace-expansion 2.1.4 경로와 사용하지 않는 CLI 의존성이 제거됩니다. 남은 brace-expansion 경로는 위 두 버전입니다.
- **glob은 메이저 버전 변경입니다.** 설치 검사, Jest 전체 테스트·커버리지, 실제 소비 경로와 glob 동작을 확인한 뒤 포함했습니다. Jest 자체 버전은 유지합니다.
- `test:dev-security`와 `test:dev-watch`, PR 자동 테스트 단계를 추가했습니다. 배포 workflow는 변경하지 않았습니다.
- 운영용 lock 항목은 변경 전후 양방향 비교로 동일함을 확인했습니다. npm이 재작성한 무관한 peer·플랫폼 메타데이터는 제외했습니다.
- `npm audit fix --force`는 사용하지 않았으며 DB 마이그레이션은 없습니다.

## 남은 항목

**남은 원인은 deepmerge 한 종류이며, 이번에는 사유를 기록하고 보류합니다.** [Aon의 동의·추가 검증 의견](https://github.com/adapterz/wku-iksan-store-BE/issues/160#issuecomment-6848105966)을 참고해 진행했습니다. 해결 완료나 위험이 없다는 판단, 영구 예외 승인을 의미하지 않습니다.

| 대상 | 남기는 이유 | 사용 범위·후속 방향 |
| --- | --- | --- |
| Jest의 deepmerge 4.3.1 | 검토 시점에 공식 수정 버전 없음 | Jest 설정 병합. 공식 패치·상위 도구 대응을 확인하고 필요 시 대체 방안 검토 |

nodemon의 minimatch를 강제 교체하는 시도는 의존성 검사 오류로 제외했으며, 대신 nodemon 자체를 제거했습니다. GitHub 경고를 임의로 dismiss하지 않습니다.

### 개발 실행 방식 변경

- 실행 명령은 `npm run dev` 그대로입니다. 내부적으로 `node --watch app.js`를 실행합니다.
- 진입 파일과 실제로 require/import한 모듈 변경 시 재시작합니다. `--watch-path`는 사용하지 않습니다.
- 불러오지 않은 파일과 `.env` 변경, 기존 `rs` 수동 재시작 대신 종료 후 `npm run dev`를 다시 실행해야 합니다.
- OS별 검증은 실제 watch 프로세스와 임시 CommonJS 파일을 사용합니다. 운영 서버·DB·프로젝트 환경변수에는 접근하지 않습니다.

### 사용 시 주의

- 애플리케이션이 deepmerge를 직접 import하거나 HTTP 요청을 전달하는 경로는 확인되지 않았습니다. 개발·CI 입력까지 안전하다는 뜻은 아닙니다.
- deepmerge는 Jest의 defaults·preset·globals 등 설정 병합에 사용됩니다. 외부 설정·preset을 검토 없이 실행하지 않습니다.
- 앞선 검토에서 Jest 30.5.2도 glob `^13.0.6`과 deepmerge `^4.3.1`을 사용하는 것으로 확인했습니다. 단순 Jest 업데이트만으로 모두 해결되지는 않습니다.
- audit가 제안하는 Jest 25.1.0 다운그레이드는 적용하지 않았습니다.

### override 유지 기준

`glob@10.5.0`만 대체하므로 다른 버전의 glob을 자동으로 보완하지는 않습니다. Jest 또는 lock을 갱신할 때 audit와 회귀 검증을 다시 실행하고, 상위 도구가 안전한 버전을 사용하면 override를 제거합니다. 구형 API를 사용하는 test-exclude의 glob 7.x는 변경하지 않았습니다.

## 검증 결과

환경: Windows, Node.js 24.11.1 / npm 11.6.2. 공유 `node_modules`와 분리한 설치 환경에서 검증했습니다.

| 검증 | 결과 |
| --- | --- |
| `npm ci` | 통과 |
| `npm ls glob minimatch brace-expansion deepmerge --all` | 의존성 오류 없이 통과 |
| `npm test -- --runInBand` | 54 suites / 889 tests 통과 |
| 커버리지 수집·glob 경로별 임계값을 포함한 전체 테스트 | 54 suites / 889 tests 통과 |
| `npm run test:dev-security` | 20건 통과 |
| `npm run test:dev-watch` | 로컬 Windows 및 PR CI의 Windows·Linux·macOS에서 각각 6건 통과 |
| 별도 새 환경의 `npm ci --omit=dev` | 통과, 개발용 도구 6종 미설치 확인 |
| `npm audit --omit=dev` | 0건 유지 |
| 전체 `npm audit` | 최초 13 → 1차 7 → nodemon 제거 후 5개 영향 패키지 항목, Low 5 / Moderate·High·Critical 0 |

전체 audit의 5개는 Jest 등 상위 의존성으로 전파된 항목을 포함합니다. **서로 다른 취약점 5개가 아니라 deepmerge 한 원인의 영향 경로 집계입니다.** GitHub 경고 개수와 직접 대응하지 않습니다.

보안 회귀 스크립트는 정상 brace 패턴, 시간 제한을 둔 자식 프로세스 입력, nodemon·minimatch 10.2.5 제거, Jest 세 소비 경로의 glob 버전, glob 동기·비동기 탐색·제외·중단 처리를 확인합니다. 별도 watch 스크립트는 설정·기동·무관한 파일 제외·의존 모듈 재시작·진입 파일 재시작·자식 프로세스를 포함한 종료를 확인합니다. 프로젝트 전체를 DB에 연결해 실행한 결과와는 구분합니다.

```sh
npm ci
npm test -- --runInBand
npm test -- --runInBand --coverage --collectCoverageFrom="controllers/**/*.js" --coverageReporters=json-summary
npm run test:dev-security
npm run test:dev-watch
npm audit --omit=dev
npm audit
```

긴 패턴 입력은 최대 5초 제한의 로컬 자식 프로세스에서만 실행합니다. 운영 HTTP 요청·구매·취소·부하 테스트는 하지 않습니다. 운영용 새 설치 검증도 로컬에서 수행했으며 서버 컨테이너 내부 검증을 대신하지 않습니다.

## 남은 확인

- [x] 로컬 새 설치·전체 테스트·커버리지·회귀 점검
- [x] 운영용 lock 항목 불변 및 개발용 패키지 제외 설치 확인
- [x] Linux 전체 테스트 및 Windows·Linux·macOS watch CI 검증 — [구현 커밋 6c83ed7 실행 결과](https://github.com/adapterz/wku-iksan-store-BE/actions/runs/43395905538)
- [ ] PR 코드 리뷰
- [ ] 병합 후 GitHub 경고 갱신 확인
- [x] nodemon 대체·deepmerge 보류 방향 확인 후 구현·기록
- [ ] deepmerge 공식 패치 또는 상위 도구 대응 시 재검토
- [ ] 최종 프로젝트 문서에 결과 반영

nodemon 대체 안내로 README를 수정해 문서 PR #159와 파일이 겹칩니다. 두 PR 반영 시 내장 watch 안내와 최종 진행 상태가 유지되는지 대조해야 합니다. 이번 검증 결과만으로 병합·배포 완료를 의미하지 않습니다.

## 근거

- brace-expansion: [시간 복잡도 문제](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [중첩 재귀 문제](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [쉼표 재귀 문제](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p)
- glob: [보안 경고](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), [14.0.5 릴리스](https://github.com/isaacs/node-glob/releases/tag/v14.0.5)
- 제거한 경로: [minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249)
- 잔여 항목: [deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)
- 실행 방식: [Node.js watch 문서](https://nodejs.org/api/cli.html#--watch)
