# 개발용 의존성 보안 검토

관련: [BE #160](https://github.com/adapterz/wku-iksan-store-BE/issues/160) · 의존성 검토일: 2026-11-12 · 테스트 재확인: 2026-11-13

## 이번 변경

**brace-expansion과 Jest의 glob 경로를 보완했습니다.** 운영용 패치 #161과 별개이며 서비스 로직·운영용 의존성·DB·FE·배포 설정은 변경하지 않습니다.

| 대상 | 기존 → 변경 | 적용 방식 |
| --- | --- | --- |
| brace-expansion | 5.0.9 → 5.0.13 / 1.1.18 → 1.1.22 | 기존 호환 범위의 lock 버전 갱신 |
| Jest가 사용하는 glob | 10.5.0 → 14.0.5 | `glob@10.5.0`에만 한정한 override |
| 위 glob의 minimatch | 9.0.9 → 11.0.8 | glob 업데이트에 따른 의존성 갱신 |

- glob 변경으로 기존 brace-expansion 2.1.4 경로와 사용하지 않는 CLI 의존성이 제거됩니다. 남은 brace-expansion 경로는 위 두 버전입니다.
- **glob은 메이저 버전 변경입니다.** 설치 검사, Jest 전체 테스트·커버리지, 실제 소비 경로와 glob 동작을 확인한 뒤 포함했습니다. Jest·nodemon 자체 버전은 유지합니다.
- `test:dev-security` 스크립트와 PR 자동 테스트 단계를 추가했습니다. 배포 workflow는 변경하지 않았습니다.
- 운영용 lock 항목은 변경 전후 양방향 비교로 동일함을 확인했습니다. npm이 재작성한 무관한 peer·플랫폼 메타데이터는 제외했습니다.
- `npm audit fix --force`는 사용하지 않았으며 DB 마이그레이션은 없습니다.

## 남은 항목

**아래 두 원인은 미해결입니다.** 현재 사용 범위를 확인한 것이며 영구 예외 승인이나 위험이 없다는 판단은 아닙니다.

| 대상 | 남기는 이유 | 사용 범위·후속 방향 |
| --- | --- | --- |
| nodemon의 minimatch 10.2.5 | 수정 버전 11.x가 nodemon의 허용 범위를 벗어남. 한정 override도 시험했으나 npm 11.6.2 의존성 검사에서 `ELSPROBLEMS`가 남아 제외 | 로컬 파일 감시 패턴 처리. 상위 도구 대응 또는 감시 도구 대체를 별도 검증 |
| Jest의 deepmerge 4.3.1 | 검토 시점에 공식 수정 버전 없음 | Jest 설정 병합. 공식 패치·상위 도구 대응을 확인하고 필요 시 대체 방안 검토 |

**후속 방향은 아직 팀 합의 전입니다.** nodemon은 Node.js 내장 감시 기능으로 대체 검토, deepmerge는 사유를 기록한 보류를 제안했습니다. [의견 요청 코멘트](https://github.com/adapterz/wku-iksan-store-BE/issues/160#issuecomment-6823720895)를 참고하며, 이번 패치에는 nodemon 제거·개발 실행 명령 변경이나 경고 해제 처리를 포함하지 않습니다.

### 사용 시 주의

- 애플리케이션이 위 두 라이브러리를 직접 import하거나 HTTP 요청을 전달하는 경로는 확인되지 않았습니다. 개발·CI 입력까지 안전하다는 뜻은 아닙니다.
- nodemon에서 확인한 호출은 watch/ignore 설정을 사용하며 해당 minimatch 경고의 조건인 `optimizationLevel: 2`는 사용하지 않습니다. 외부 입력이나 확인하지 않은 감시 설정을 그대로 실행하지 않습니다.
- deepmerge는 Jest의 defaults·preset·globals 등 설정 병합에 사용됩니다. 외부 설정·preset을 검토 없이 실행하지 않습니다.
- 최신 nodemon 3.1.14도 minimatch `^10.2.1`, Jest 30.5.2도 glob `^13.0.6`과 deepmerge `^4.3.1`을 사용합니다. 단순 상위 도구 업데이트만으로 모두 해결되지는 않습니다.
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
| 별도 새 환경의 `npm ci --omit=dev` | 통과, 개발용 도구 6종 미설치 확인 |
| `npm audit --omit=dev` | 0건 유지 |
| 전체 `npm audit` | 13 → 7개 영향 패키지 항목, High 1 → 0 / Moderate 9 → 2 / Low 3 → 5 |

전체 audit의 7개는 Jest 등 상위 의존성으로 전파된 항목을 포함합니다. **서로 다른 취약점 7개가 아니라 남은 원인 두 종류의 영향 경로 집계입니다.** Low 항목 증가 역시 이 집계의 변화이며, GitHub 경고 개수와 직접 대응하지 않습니다.

회귀 스크립트는 정상 brace 패턴, 시간 제한을 둔 자식 프로세스 입력, nodemon 파일 매칭, Jest 세 소비 경로의 실제 glob 버전, glob 동기·비동기 탐색·제외·중단 처리를 확인합니다. nodemon의 실제 파일 변경 후 재시작 전체 흐름까지 검증한 것은 아닙니다.

```sh
npm ci
npm test -- --runInBand
npm test -- --runInBand --coverage --collectCoverageFrom="controllers/**/*.js" --coverageReporters=json-summary
npm run test:dev-security
npm audit --omit=dev
npm audit
```

긴 패턴 입력은 최대 5초 제한의 로컬 자식 프로세스에서만 실행합니다. 운영 HTTP 요청·구매·취소·부하 테스트는 하지 않습니다. 운영용 새 설치 검증도 로컬에서 수행했으며 서버 컨테이너 내부 검증을 대신하지 않습니다.

## 남은 확인

- [x] 로컬 새 설치·전체 테스트·커버리지·회귀 점검
- [x] 운영용 lock 항목 불변 및 개발용 패키지 제외 설치 확인
- [ ] PR 리뷰 및 Linux CI 검증
- [ ] 병합 후 GitHub 경고 갱신 확인
- [ ] minimatch·deepmerge 처리 방침 합의·후속 검토
- [ ] 최종 프로젝트 문서에 결과 반영

문서 PR #159와 이번 변경의 파일 경로는 겹치지 않습니다. 다만 최종 문서의 진행 상태는 패치 리뷰 결과에 맞춰 별도로 정리해야 합니다. 이번 검증 결과만으로 병합·배포 완료를 의미하지 않습니다.

## 근거

- brace-expansion: [시간 복잡도 문제](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [중첩 재귀 문제](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [쉼표 재귀 문제](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p)
- glob: [보안 경고](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), [14.0.5 릴리스](https://github.com/isaacs/node-glob/releases/tag/v14.0.5)
- 잔여 항목: [minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249), [deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)
