/* OpenDX collector protocol v1. Generated from the maintained parser. */
(() => {
  const script = document.currentScript;
  if (!script || script.id !== 'opendx-loader' || script.dataset.active !== '1') return;
  const destination = new URL(script.dataset.target);
  const target = destination.origin;
  if (destination.protocol !== 'https:' && !(destination.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(destination.hostname))) return;
  script.dataset.ready = '1';
  const locale = ['ko', 'en', 'ja', 'zh-TW'].includes(script.dataset.locale) ? script.dataset.locale : 'en';
  switch (locale) { case "ko": (async function collector(targetOrigin, parsers, messages) {
  const t = (key, values = {}) =>
    (messages[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`));
  const allowed = ['https://maimaidx-eng.com', 'https://maimaidx.jp'];
  if (!allowed.includes(location.origin) || !location.pathname.startsWith('/maimai-mobile/')) {
    alert(t('maimai DX NET에 로그인한 후 Aime 카드를 선택하고 OpenDX 북마클릿을 실행해 주세요.'));
    return;
  }
  if (/\/(aimeList|courseDetail)(\/|$)/.test(location.pathname)) {
    alert(t('Aime 카드를 먼저 선택해 주세요.'));
    return;
  }
  if (document.getElementById('opendx-collector')) {
    alert(t('OpenDX 수집이 이미 진행 중입니다.'));
    return;
  }
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
  let popup = window.open(targetOrigin + '/sega-import#' + nonce, 'opendx-import');
  const panel = document.createElement('section');
  panel.id = 'opendx-collector';
  panel.setAttribute(
    'style',
    'position:fixed;z-index:2147483647;bottom:16px;right:16px;max-width:340px;padding:20px;background:#111113;color:#f4f4f5;border:1px solid #444;font:14px/1.6 sans-serif;box-shadow:0 6px 32px #0006;',
  );
  const heading = document.createElement('strong');
  heading.textContent = 'OpenDX';
  heading.style.color = '#baf34a';
  const status = document.createElement('p');
  status.textContent = t('OpenDX 가져오기 창에서 시작 버튼을 눌러 주세요.');
  const cancel = document.createElement('button');
  cancel.textContent = t('중단');
  cancel.setAttribute(
    'style',
    'background:#27272a;color:white;border:1px solid #555;padding:8px 16px;cursor:pointer;',
  );
  panel.append(heading, status, cancel);
  document.body.append(panel);
  const controller = new AbortController();
  let started = false,
    closed = false;
  const send = (type, data = {}) => {
    if (!closed && popup && !popup.closed)
      popup.postMessage({ channel: 'opendx-sega-v1', nonce, type, ...data }, targetOrigin);
  };
  const stop = () => {
    closed = true;
    controller.abort();
    clearInterval(hello);
    window.removeEventListener('message', receive);
    panel.remove();
  };
  cancel.onclick = () => {
    send('CANCELLED');
    stop();
  };
  if (!popup) {
    status.textContent = t('가져오기 창을 열어 주세요.');
    const retry = document.createElement('button');
    retry.textContent = t('OpenDX 창 열기');
    retry.onclick = () => {
      popup = window.open(targetOrigin + '/sega-import#' + nonce, 'opendx-import');
    };
    panel.insertBefore(retry, cancel);
  }
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function get(route) {
    if (controller.signal.aborted) throw new Error(t('수집을 중단했습니다.'));
    const timeout = AbortSignal.timeout(20000);
    const response = await fetch('/maimai-mobile/' + route, {
      credentials: 'same-origin',
      signal: AbortSignal.any([controller.signal, timeout]),
    });
    if (response.status === 401 || response.status === 403)
      throw new Error(
        t('SEGA 로그인이 만료되었거나 접근할 수 없는 페이지입니다. 다시 로그인해 주세요.'),
      );
    if (!response.ok) throw new Error(t('SEGA 응답 오류 ({status})', { status: response.status }));
    if (
      new URL(response.url).origin !== location.origin ||
      !/\/maimai-mobile\//.test(new URL(response.url).pathname)
    )
      throw new Error(t('SEGA 로그인이 만료되었습니다.'));
    const html = await response.text();
    if (/Sorry, servers are under maintenance|ただいまメンテナンス中です/.test(html))
      throw new Error(t('현재 SEGA 점검 중입니다.'));
    if (/(?:ERROR CODE|エラーコード)\s*[：:]/.test(html))
      throw new Error(t('SEGA에서 오류 페이지를 반환했습니다.'));
    return new DOMParser().parseFromString(html, 'text/html');
  }
  async function run() {
    if (started) return;
    started = true;
    clearInterval(hello);
    try {
      status.textContent = t('플레이어 정보를 읽고 있습니다.');
      send('PROGRESS', { message: status.textContent, step: 0, total: 8 });
      const profile = parsers.profile(await get('playerData/'));
      await wait(350);
      const records = [],
        counts = [];
      for (let diff = 0; diff < 5; diff++) {
        status.textContent = t('난이도별 기록을 읽고 있습니다. ({current}/5)', {
          current: diff + 1,
        });
        send('PROGRESS', { message: status.textContent, step: diff + 1, total: 8 });
        const page = parsers.records(
          await get(`record/musicGenre/search/?genre=99&diff=${diff}`),
          diff,
        );
        records.push(...page.records);
        counts.push({ difficulty: diff, listed: page.total, played: page.records.length });
        await wait(350);
      }
      if (!records.length)
        throw new Error(
          t('플레이 기록을 찾지 못했습니다. 로그인 상태와 Aime 카드 선택을 확인해 주세요.'),
        );
      const grouped = new Map();
      for (const r of records) {
        const key = [r.title, r.type, r.difficulty].join('\0');
        const group = grouped.get(key) || [];
        group.push(r);
        grouped.set(key, group);
      }
      const duplicates = [
        ...new Set(
          [...grouped.values()]
            .filter((g) => g.length > 1)
            .flat()
            .map((r) => r.idx),
        ),
      ];
      const detailMap = new Map();
      for (let i = 0; i < duplicates.length; i++) {
        if (i >= 100)
          throw new Error(
            t('동명곡이 너무 많아 안전하게 중단했습니다. 페이지 형식을 확인해 주세요.'),
          );
        status.textContent = t('동명곡을 구분하고 있습니다. ({current}/{total})', {
          current: i + 1,
          total: duplicates.length,
        });
        send('PROGRESS', { message: status.textContent, step: 6, total: 8 });
        const idx = duplicates[i];
        detailMap.set(
          idx,
          parsers.details(await get('record/musicDetail/?idx=' + encodeURIComponent(idx))),
        );
        await wait(350);
      }
      let targets = [],
        warnings = [];
      try {
        targets = parsers.targets(await get('home/ratingTargetMusic/'));
      } catch (e) {
        warnings.push(
          t('레이팅 대상곡은 가져오지 못했습니다. 기록 자체는 정상적으로 수집했습니다.'),
        );
      }
      let stamps;
      status.textContent = t('스탬프 카드를 읽고 있습니다.');
      send('PROGRESS', { message: status.textContent, step: 7, total: 8 });
      await wait(350);
      try {
        stamps = parsers.stamps(
          await get('playerData/stampCard/'),
          location.hostname === 'maimaidx.jp' ? 'jp' : 'intl',
        );
      } catch (e) {
        warnings.push(t('스탬프 카드는 가져오지 못했습니다. 기존 카드 정보는 유지합니다.'));
      }
      if (closed || controller.signal.aborted) return;
      const payload = {
        format: 'opendx-sega/v1',
        region: location.hostname === 'maimaidx.jp' ? 'jp' : 'intl',
        collectedAt: new Date().toISOString(),
        profile,
        counts,
        targets,
        ...(stamps !== undefined ? { stamps } : {}),
        warnings,
        records: records.map(({ idx, ...r }) => ({ ...r, ...detailMap.get(idx) })),
      };
      send('DATA', { payload });
      status.textContent = t(
        '{count}개 기록을 OpenDX로 전달했습니다. 가져오기 창에서 확인하고 저장하세요.',
        { count: records.length.toLocaleString() },
      );
      cancel.textContent = t('닫기');
      send('PROGRESS', { message: t('기록 수집 완료'), step: 8, total: 8 });
    } catch (e) {
      if (!closed) {
        const message =
          e.name === 'AbortError'
            ? t('수집을 중단했습니다.')
            : e.name === 'TimeoutError'
              ? t('SEGA 응답 시간이 초과되었습니다. 잠시 뒤 다시 실행해 주세요.')
              : e.message;
        status.textContent = t(message);
        send('ERROR', { message: t(message) });
        cancel.textContent = t('닫기');
      }
    }
  }
  function receive(event) {
    if (
      event.origin !== targetOrigin ||
      event.source !== popup ||
      event.data?.channel !== 'opendx-sega-v1' ||
      event.data?.nonce !== nonce
    )
      return;
    if (event.data.type === 'START') run();
    if (event.data.type === 'CANCEL') stop();
  }
  window.addEventListener('message', receive);
  const hello = setInterval(() => {
    if (popup?.closed) {
      stop();
      return;
    }
    send('HELLO', { region: location.hostname === 'maimaidx.jp' ? 'jp' : 'intl' });
  }, 600);
  setTimeout(() => {
    if (!started && !closed) {
      status.textContent = t('연결 대기 시간이 지났습니다. 북마클릿을 다시 실행해 주세요.');
      clearInterval(hello);
      window.removeEventListener('message', receive);
    }
  }, 10 * 60000);
})(target,{profile:function parseSegaProfile(doc) {
  const text = (s) => (doc.querySelector(s)?.textContent ?? '').trim();
  const name = text('div.name_block');
  if (!name)
    throw new Error(
      '플레이어 정보를 찾지 못했습니다. SEGA 로그인과 Aime 카드 선택을 확인해 주세요.',
    );
  const body = doc.body.textContent ?? '';
  const play = body.match(/(?:maimaiDX total play count|累計プレイ回数)\s*[：:]\s*([\d,]+)/i);
  const current = body.match(
    /(?:play count of current version|現バージョンプレイ回数)\s*[：:]\s*([\d,]+)/i,
  );
  const image = doc.querySelector('div.basic_block img.w_112')?.getAttribute('src') ?? '';
  const danImage =
    [...doc.querySelectorAll('img')]
      .map((i) => i.getAttribute('src') ?? '')
      .find((s) => /course_rank_\d+/.test(s)) ?? '';
  const classImage =
    [...doc.querySelectorAll('img')]
      .map((i) => i.getAttribute('src') ?? '')
      .find((s) => /class_rank_s_\d+/.test(s)) ?? '';
  const stars = text('div.p_l_10.f_l > div.p_l_10.f_l.f_14').replace(/[^\d]/g, '');
  return {
    name: name.slice(0, 32),
    trophy: text('div.trophy_block > div.trophy_inner_block').slice(0, 100),
    trophyTier: (
      doc
        .querySelector('div.trophy_block')
        ?.className.match(/\btrophy_(Normal|Bronze|Silver|Gold|Rainbow)\b/i)?.[1] ?? 'NORMAL'
    ).toUpperCase(),
    rating: Number(text('div.rating_block').replace(/,/g, '')) || 0,
    imageHash: image.match(/\/Icon\/([a-f\d]{16})\.png/i)?.[1] ?? null,
    playCount: play ? Number(play[1].replace(/,/g, '')) : 0,
    currentPlayCount: current ? Number(current[1].replace(/,/g, '')) : 0,
    dan: Number(danImage.match(/course_rank_(\d+)/)?.[1] ?? 0),
    rank: Number(classImage.match(/class_rank_s_(\d+)/)?.[1] ?? 0),
    stars: Number(stars) || 0,
  };
},records:function parseSegaRecordPage(doc, difficulty) {
  const levels = ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'RE_MASTER'];
  const comboMap = {
    fc: 'FULL_COMBO',
    fcp: 'FULL_COMBO_PLUS',
    ap: 'ALL_PERFECT',
    app: 'ALL_PERFECT_PLUS',
  };
  const syncMap = {
    sync: 'SYNC_PLAY',
    fs: 'FULL_SYNC',
    fsp: 'FULL_SYNC_PLUS',
    fdx: 'FULL_SYNC_DX',
    fdxp: 'FULL_SYNC_DX_PLUS',
  };
  const rows = [...doc.querySelectorAll('div.main_wrapper > div')].filter(
    (el) => el.querySelector('input[name="idx"]') && el.querySelector('div.music_name_block'),
  );
  if (!doc.querySelector('div.main_wrapper'))
    throw new Error('기록 페이지 구조를 확인할 수 없습니다. 로그인을 확인해 주세요.');
  const records = [];
  let unplayed = 0;
  for (const row of rows) {
    const form = row.querySelector('form') ?? row;
    const title = (form.querySelector('div.music_name_block')?.textContent ?? '').trim();
    const blocks = [...form.querySelectorAll('div.music_score_block')];
    if (!blocks.length) {
      unplayed++;
      continue;
    }
    const achievementText = blocks.map((x) => x.textContent ?? '').find((x) => x.includes('%'));
    if (!achievementText)
      throw new Error('달성률 형식이 변경되었습니다. 기록을 저장하지 않았습니다.');
    const achievement = Number(achievementText.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(achievement) || achievement < 0 || achievement > 101)
      throw new Error('허용 범위를 벗어난 달성률입니다.');
    const images = [...row.querySelectorAll('img')].map((i) => i.getAttribute('src') ?? '');
    const kind = row.querySelector('img.music_kind_icon')?.getAttribute('src') ?? '';
    let type = /music_dx/.test(kind) ? 'DX' : /music_standard/.test(kind) ? 'ST' : null;
    if (!type) {
      if (row.querySelector('img.music_kind_icon_standard.pointer')) type = 'DX';
      else if (row.querySelector('img.music_kind_icon_dx.pointer')) type = 'ST';
    }
    // In the tabbed view, the pointer is the other type one can switch to.
    if (!type) throw new Error(`채보 유형을 확인할 수 없습니다: ${title}`);
    const diffFile =
      images.find((s) => /diff_(basic|advanced|expert|master|remaster)\.png/.test(s)) ?? '';
    const parsedDifficulty =
      {
        basic: 'BASIC',
        advanced: 'ADVANCED',
        expert: 'EXPERT',
        master: 'MASTER',
        remaster: 'RE_MASTER',
      }[diffFile.match(/diff_(\w+)\.png/)?.[1]] ?? levels[difficulty];
    let combo = '',
      sync = '';
    for (const src of images) {
      const suffix = src.match(/music_icon_(\w+)\.png/)?.[1];
      if (suffix && comboMap[suffix]) combo = comboMap[suffix];
      if (suffix && syncMap[suffix]) sync = syncMap[suffix];
    }
    const dx = blocks
      .map((x) => x.textContent ?? '')
      .find((x) => x.includes('/'))
      ?.match(/([\d,]+)\s*\/\s*([\d,]+)/);
    records.push({
      title,
      difficulty: parsedDifficulty,
      type,
      displayLevel: (form.querySelector('div.music_lv_block')?.textContent ?? '').trim(),
      achievement,
      combo,
      sync,
      dxScore: dx ? Number(dx[1].replace(/,/g, '')) : 0,
      dxMax: dx ? Number(dx[2].replace(/,/g, '')) : 0,
      imageHash:
        images.map((s) => s.match(/\/Music\/([a-f\d]{16})\.png/i)?.[1]).find(Boolean) ?? null,
      idx: form.querySelector('input[name="idx"]')?.getAttribute('value') ?? '',
    });
  }
  return { records, total: rows.length, unplayed };
},details:function parseSegaDetails(doc) {
  const image =
    [...doc.querySelectorAll('img')]
      .map((i) => i.getAttribute('src') ?? '')
      .find((s) => /\/Music\/[a-f\d]{16}\.png/i.test(s)) ?? '';
  const artist = (
    doc.querySelector('div.main_wrapper > div.basic_block > div.w_250.f_l.t_l > div.m_5.f_15.break')
      ?.textContent ?? ''
  ).trim();
  return { imageHash: image.match(/\/Music\/([a-f\d]{16})\.png/i)?.[1] ?? null, artist };
},targets:function parseSegaTargets(doc) {
  const result = [];
  let group = '';
  for (const el of doc.querySelectorAll('div.main_wrapper > div')) {
    if (el.classList.contains('screw_block')) {
      const text = el.textContent ?? '';
      group = /candidate|selection|候補/i.test(text)
        ? 'candidate'
        : /new|新曲/i.test(text)
          ? 'new'
          : /old|旧曲/i.test(text)
            ? 'old'
            : '';
    }
    const title = el.querySelector('div.music_name_block')?.textContent?.trim();
    if (title && group && group !== 'candidate') {
      const img = [...el.querySelectorAll('img')].map((i) => i.getAttribute('src') ?? '');
      const type = img.some((s) => /music_dx\.png/.test(s)) ? 'DX' : 'ST';
      const match = img.join(' ').match(/diff_(basic|advanced|expert|master|remaster)\.png/);
      const difficulty = {
        basic: 'BASIC',
        advanced: 'ADVANCED',
        expert: 'EXPERT',
        master: 'MASTER',
        remaster: 'RE_MASTER',
      }[match?.[1]];
      if (difficulty) result.push({ title, type, difficulty, group });
    }
  }
  return result;
},stamps:function parseSegaStamps(doc, region = 'intl') {
  const cards = [...doc.querySelectorAll('div[name="type_partner"], div[name="type_other"]')];
  const stampPage =
    doc.querySelector('img[src*="stampcard"]') ||
    /stamp\s*cards?|スタンプカード/i.test(doc.body?.textContent ?? '');
  if (!doc.querySelector('div.main_wrapper') || (!cards.length && !stampPage))
    throw new Error('스탬프 카드 페이지를 확인할 수 없습니다.');
  const groups = {
    partner: 'Partner',
    music: 'Music',
    icon: 'Icon',
    nameplate: 'NamePlate',
    frame: 'Frame',
  };
  return cards.map((card) => {
    const title = card.querySelector('div.stampcard_inner_block')?.textContent?.trim();
    if (!title) throw new Error('스탬프 카드 이름을 확인할 수 없습니다.');
    const background = card.querySelector('img.stampcard_back')?.getAttribute('src') ?? '';
    const type =
      card.getAttribute('name') === 'type_partner'
        ? 'partner'
        : ['music', 'icon', 'nameplate', 'frame', 'ticket'].find((t) => background.includes(t));
    if (!type) throw new Error('스탬프 카드 종류를 확인할 수 없습니다.');
    const maxCount = type === 'icon' ? 5 : 10,
      complete = !!card.querySelector('img.stampcard_comp');
    let stampCount = 0;
    for (const image of card.querySelectorAll('img'))
      for (const name of image.classList) {
        const found = /^stamp_count_(\d+)$/.exec(name);
        if (found) stampCount = Math.max(stampCount, Number(found[1]));
      }
    if (stampCount > maxCount) throw new Error('스탬프 진행 수가 허용 범위를 벗어났습니다.');
    const src = card.querySelector(`img.stampcard_${type}`)?.getAttribute('src') ?? '';
    const group = groups[type];
    const hash = group
      ? new RegExp('/' + group + '/([a-f0-9]{16})\\.png(?:[?#]|$)', 'i').exec(src)?.[1]
      : null;
    if (type !== 'ticket' && !hash) throw new Error('스탬프 보상 이미지를 확인할 수 없습니다.');
    return {
      type,
      displayName: title.slice(0, 300),
      stampCount: complete ? maxCount : stampCount,
      maxCount,
      complete,
      ...(hash ? { image: `/api/art/${region === 'jp' ? 'jp/' : ''}${group}/${hash}.png` } : {}),
    };
  });
}},{"완료":"완료","레이팅":"레이팅","기록":"기록","스탬프":"스탬프","레이팅 대상곡":"레이팅 대상곡","달성률":"달성률","채보 유형":"채보 유형","스탬프 카드":"스탬프 카드","개":"개","연결":"연결","기록 수집":"기록 수집","플레이어":"플레이어","OpenDX 북마클릿":"OpenDX 북마클릿","{count}개 기록":"{count}개 기록","SEGA 로그인":"SEGA 로그인","저장":"저장","닫기":"닫기","플레이어 정보를 읽고 있습니다.":"플레이어 정보를 읽고 있습니다.","난이도별 기록을 읽고 있습니다. ({current}/5)":"난이도별 기록을 읽고 있습니다. ({current}/5)","동명곡을 구분하고 있습니다. ({current}/{total})":"동명곡을 구분하고 있습니다. ({current}/{total})","스탬프 카드를 읽고 있습니다.":"스탬프 카드를 읽고 있습니다.","기록 수집 완료":"기록 수집 완료","스탬프 카드는 가져오지 못했습니다. 기존 카드 정보는 유지합니다.":"스탬프 카드는 가져오지 못했습니다. 기존 카드 정보는 유지합니다.","레이팅 대상곡은 가져오지 못했습니다. 기록 자체는 정상적으로 수집했습니다.":"레이팅 대상곡은 가져오지 못했습니다. 기록 자체는 정상적으로 수집했습니다.","SEGA 로그인이 만료되었습니다.":"SEGA 로그인이 만료되었습니다.","현재 SEGA 점검 중입니다.":"현재 SEGA 점검 중입니다.","수집을 중단했습니다.":"수집을 중단했습니다.","SEGA 응답 시간이 초과되었습니다. 잠시 뒤 다시 실행해 주세요.":"SEGA 응답 시간이 초과되었습니다. 잠시 뒤 다시 실행해 주세요.","SEGA에서 오류 페이지를 반환했습니다.":"SEGA에서 오류 페이지를 반환했습니다.","maimai DX NET에 로그인한 후 Aime 카드를 선택하고 OpenDX 북마클릿을 실행해 주세요.":"maimai DX NET에 로그인한 후 Aime 카드를 선택하고 OpenDX 북마클릿을 실행해 주세요.","Aime 카드를 먼저 선택해 주세요.":"Aime 카드를 먼저 선택해 주세요.","OpenDX 수집이 이미 진행 중입니다.":"OpenDX 수집이 이미 진행 중입니다.","OpenDX 가져오기 창에서 시작 버튼을 눌러 주세요.":"OpenDX 가져오기 창에서 시작 버튼을 눌러 주세요.","중단":"중단","가져오기 창을 열어 주세요.":"가져오기 창을 열어 주세요.","OpenDX 창 열기":"OpenDX 창 열기","SEGA 로그인이 만료되었거나 접근할 수 없는 페이지입니다. 다시 로그인해 주세요.":"SEGA 로그인이 만료되었거나 접근할 수 없는 페이지입니다. 다시 로그인해 주세요.","SEGA 응답 오류 ({status})":"SEGA 응답 오류 ({status})","플레이 기록을 찾지 못했습니다. 로그인 상태와 Aime 카드 선택을 확인해 주세요.":"플레이 기록을 찾지 못했습니다. 로그인 상태와 Aime 카드 선택을 확인해 주세요.","동명곡이 너무 많아 안전하게 중단했습니다. 페이지 형식을 확인해 주세요.":"동명곡이 너무 많아 안전하게 중단했습니다. 페이지 형식을 확인해 주세요.","{count}개 기록을 OpenDX로 전달했습니다. 가져오기 창에서 확인하고 저장하세요.":"{count}개 기록을 OpenDX로 전달했습니다. 가져오기 창에서 확인하고 저장하세요.","연결 대기 시간이 지났습니다. 북마클릿을 다시 실행해 주세요.":"연결 대기 시간이 지났습니다. 북마클릿을 다시 실행해 주세요.","플레이어 정보를 찾지 못했습니다. SEGA 로그인과 Aime 카드 선택을 확인해 주세요.":"플레이어 정보를 찾지 못했습니다. SEGA 로그인과 Aime 카드 선택을 확인해 주세요.","기록 페이지 구조를 확인할 수 없습니다. 로그인을 확인해 주세요.":"기록 페이지 구조를 확인할 수 없습니다. 로그인을 확인해 주세요.","달성률 형식이 변경되었습니다. 기록을 저장하지 않았습니다.":"달성률 형식이 변경되었습니다. 기록을 저장하지 않았습니다.","허용 범위를 벗어난 달성률입니다.":"허용 범위를 벗어난 달성률입니다.","스탬프 카드 페이지를 확인할 수 없습니다.":"스탬프 카드 페이지를 확인할 수 없습니다.","스탬프 카드 이름을 확인할 수 없습니다.":"스탬프 카드 이름을 확인할 수 없습니다.","스탬프 카드 종류를 확인할 수 없습니다.":"스탬프 카드 종류를 확인할 수 없습니다.","스탬프 진행 수가 허용 범위를 벗어났습니다.":"스탬프 진행 수가 허용 범위를 벗어났습니다.","스탬프 보상 이미지를 확인할 수 없습니다.":"스탬프 보상 이미지를 확인할 수 없습니다."}); break;
case "en": (async function collector(targetOrigin, parsers, messages) {
  const t = (key, values = {}) =>
    (messages[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`));
  const allowed = ['https://maimaidx-eng.com', 'https://maimaidx.jp'];
  if (!allowed.includes(location.origin) || !location.pathname.startsWith('/maimai-mobile/')) {
    alert(t('maimai DX NET에 로그인한 후 Aime 카드를 선택하고 OpenDX 북마클릿을 실행해 주세요.'));
    return;
  }
  if (/\/(aimeList|courseDetail)(\/|$)/.test(location.pathname)) {
    alert(t('Aime 카드를 먼저 선택해 주세요.'));
    return;
  }
  if (document.getElementById('opendx-collector')) {
    alert(t('OpenDX 수집이 이미 진행 중입니다.'));
    return;
  }
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
  let popup = window.open(targetOrigin + '/sega-import#' + nonce, 'opendx-import');
  const panel = document.createElement('section');
  panel.id = 'opendx-collector';
  panel.setAttribute(
    'style',
    'position:fixed;z-index:2147483647;bottom:16px;right:16px;max-width:340px;padding:20px;background:#111113;color:#f4f4f5;border:1px solid #444;font:14px/1.6 sans-serif;box-shadow:0 6px 32px #0006;',
  );
  const heading = document.createElement('strong');
  heading.textContent = 'OpenDX';
  heading.style.color = '#baf34a';
  const status = document.createElement('p');
  status.textContent = t('OpenDX 가져오기 창에서 시작 버튼을 눌러 주세요.');
  const cancel = document.createElement('button');
  cancel.textContent = t('중단');
  cancel.setAttribute(
    'style',
    'background:#27272a;color:white;border:1px solid #555;padding:8px 16px;cursor:pointer;',
  );
  panel.append(heading, status, cancel);
  document.body.append(panel);
  const controller = new AbortController();
  let started = false,
    closed = false;
  const send = (type, data = {}) => {
    if (!closed && popup && !popup.closed)
      popup.postMessage({ channel: 'opendx-sega-v1', nonce, type, ...data }, targetOrigin);
  };
  const stop = () => {
    closed = true;
    controller.abort();
    clearInterval(hello);
    window.removeEventListener('message', receive);
    panel.remove();
  };
  cancel.onclick = () => {
    send('CANCELLED');
    stop();
  };
  if (!popup) {
    status.textContent = t('가져오기 창을 열어 주세요.');
    const retry = document.createElement('button');
    retry.textContent = t('OpenDX 창 열기');
    retry.onclick = () => {
      popup = window.open(targetOrigin + '/sega-import#' + nonce, 'opendx-import');
    };
    panel.insertBefore(retry, cancel);
  }
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function get(route) {
    if (controller.signal.aborted) throw new Error(t('수집을 중단했습니다.'));
    const timeout = AbortSignal.timeout(20000);
    const response = await fetch('/maimai-mobile/' + route, {
      credentials: 'same-origin',
      signal: AbortSignal.any([controller.signal, timeout]),
    });
    if (response.status === 401 || response.status === 403)
      throw new Error(
        t('SEGA 로그인이 만료되었거나 접근할 수 없는 페이지입니다. 다시 로그인해 주세요.'),
      );
    if (!response.ok) throw new Error(t('SEGA 응답 오류 ({status})', { status: response.status }));
    if (
      new URL(response.url).origin !== location.origin ||
      !/\/maimai-mobile\//.test(new URL(response.url).pathname)
    )
      throw new Error(t('SEGA 로그인이 만료되었습니다.'));
    const html = await response.text();
    if (/Sorry, servers are under maintenance|ただいまメンテナンス中です/.test(html))
      throw new Error(t('현재 SEGA 점검 중입니다.'));
    if (/(?:ERROR CODE|エラーコード)\s*[：:]/.test(html))
      throw new Error(t('SEGA에서 오류 페이지를 반환했습니다.'));
    return new DOMParser().parseFromString(html, 'text/html');
  }
  async function run() {
    if (started) return;
    started = true;
    clearInterval(hello);
    try {
      status.textContent = t('플레이어 정보를 읽고 있습니다.');
      send('PROGRESS', { message: status.textContent, step: 0, total: 8 });
      const profile = parsers.profile(await get('playerData/'));
      await wait(350);
      const records = [],
        counts = [];
      for (let diff = 0; diff < 5; diff++) {
        status.textContent = t('난이도별 기록을 읽고 있습니다. ({current}/5)', {
          current: diff + 1,
        });
        send('PROGRESS', { message: status.textContent, step: diff + 1, total: 8 });
        const page = parsers.records(
          await get(`record/musicGenre/search/?genre=99&diff=${diff}`),
          diff,
        );
        records.push(...page.records);
        counts.push({ difficulty: diff, listed: page.total, played: page.records.length });
        await wait(350);
      }
      if (!records.length)
        throw new Error(
          t('플레이 기록을 찾지 못했습니다. 로그인 상태와 Aime 카드 선택을 확인해 주세요.'),
        );
      const grouped = new Map();
      for (const r of records) {
        const key = [r.title, r.type, r.difficulty].join('\0');
        const group = grouped.get(key) || [];
        group.push(r);
        grouped.set(key, group);
      }
      const duplicates = [
        ...new Set(
          [...grouped.values()]
            .filter((g) => g.length > 1)
            .flat()
            .map((r) => r.idx),
        ),
      ];
      const detailMap = new Map();
      for (let i = 0; i < duplicates.length; i++) {
        if (i >= 100)
          throw new Error(
            t('동명곡이 너무 많아 안전하게 중단했습니다. 페이지 형식을 확인해 주세요.'),
          );
        status.textContent = t('동명곡을 구분하고 있습니다. ({current}/{total})', {
          current: i + 1,
          total: duplicates.length,
        });
        send('PROGRESS', { message: status.textContent, step: 6, total: 8 });
        const idx = duplicates[i];
        detailMap.set(
          idx,
          parsers.details(await get('record/musicDetail/?idx=' + encodeURIComponent(idx))),
        );
        await wait(350);
      }
      let targets = [],
        warnings = [];
      try {
        targets = parsers.targets(await get('home/ratingTargetMusic/'));
      } catch (e) {
        warnings.push(
          t('레이팅 대상곡은 가져오지 못했습니다. 기록 자체는 정상적으로 수집했습니다.'),
        );
      }
      let stamps;
      status.textContent = t('스탬프 카드를 읽고 있습니다.');
      send('PROGRESS', { message: status.textContent, step: 7, total: 8 });
      await wait(350);
      try {
        stamps = parsers.stamps(
          await get('playerData/stampCard/'),
          location.hostname === 'maimaidx.jp' ? 'jp' : 'intl',
        );
      } catch (e) {
        warnings.push(t('스탬프 카드는 가져오지 못했습니다. 기존 카드 정보는 유지합니다.'));
      }
      if (closed || controller.signal.aborted) return;
      const payload = {
        format: 'opendx-sega/v1',
        region: location.hostname === 'maimaidx.jp' ? 'jp' : 'intl',
        collectedAt: new Date().toISOString(),
        profile,
        counts,
        targets,
        ...(stamps !== undefined ? { stamps } : {}),
        warnings,
        records: records.map(({ idx, ...r }) => ({ ...r, ...detailMap.get(idx) })),
      };
      send('DATA', { payload });
      status.textContent = t(
        '{count}개 기록을 OpenDX로 전달했습니다. 가져오기 창에서 확인하고 저장하세요.',
        { count: records.length.toLocaleString() },
      );
      cancel.textContent = t('닫기');
      send('PROGRESS', { message: t('기록 수집 완료'), step: 8, total: 8 });
    } catch (e) {
      if (!closed) {
        const message =
          e.name === 'AbortError'
            ? t('수집을 중단했습니다.')
            : e.name === 'TimeoutError'
              ? t('SEGA 응답 시간이 초과되었습니다. 잠시 뒤 다시 실행해 주세요.')
              : e.message;
        status.textContent = t(message);
        send('ERROR', { message: t(message) });
        cancel.textContent = t('닫기');
      }
    }
  }
  function receive(event) {
    if (
      event.origin !== targetOrigin ||
      event.source !== popup ||
      event.data?.channel !== 'opendx-sega-v1' ||
      event.data?.nonce !== nonce
    )
      return;
    if (event.data.type === 'START') run();
    if (event.data.type === 'CANCEL') stop();
  }
  window.addEventListener('message', receive);
  const hello = setInterval(() => {
    if (popup?.closed) {
      stop();
      return;
    }
    send('HELLO', { region: location.hostname === 'maimaidx.jp' ? 'jp' : 'intl' });
  }, 600);
  setTimeout(() => {
    if (!started && !closed) {
      status.textContent = t('연결 대기 시간이 지났습니다. 북마클릿을 다시 실행해 주세요.');
      clearInterval(hello);
      window.removeEventListener('message', receive);
    }
  }, 10 * 60000);
})(target,{profile:function parseSegaProfile(doc) {
  const text = (s) => (doc.querySelector(s)?.textContent ?? '').trim();
  const name = text('div.name_block');
  if (!name)
    throw new Error(
      '플레이어 정보를 찾지 못했습니다. SEGA 로그인과 Aime 카드 선택을 확인해 주세요.',
    );
  const body = doc.body.textContent ?? '';
  const play = body.match(/(?:maimaiDX total play count|累計プレイ回数)\s*[：:]\s*([\d,]+)/i);
  const current = body.match(
    /(?:play count of current version|現バージョンプレイ回数)\s*[：:]\s*([\d,]+)/i,
  );
  const image = doc.querySelector('div.basic_block img.w_112')?.getAttribute('src') ?? '';
  const danImage =
    [...doc.querySelectorAll('img')]
      .map((i) => i.getAttribute('src') ?? '')
      .find((s) => /course_rank_\d+/.test(s)) ?? '';
  const classImage =
    [...doc.querySelectorAll('img')]
      .map((i) => i.getAttribute('src') ?? '')
      .find((s) => /class_rank_s_\d+/.test(s)) ?? '';
  const stars = text('div.p_l_10.f_l > div.p_l_10.f_l.f_14').replace(/[^\d]/g, '');
  return {
    name: name.slice(0, 32),
    trophy: text('div.trophy_block > div.trophy_inner_block').slice(0, 100),
    trophyTier: (
      doc
        .querySelector('div.trophy_block')
        ?.className.match(/\btrophy_(Normal|Bronze|Silver|Gold|Rainbow)\b/i)?.[1] ?? 'NORMAL'
    ).toUpperCase(),
    rating: Number(text('div.rating_block').replace(/,/g, '')) || 0,
    imageHash: image.match(/\/Icon\/([a-f\d]{16})\.png/i)?.[1] ?? null,
    playCount: play ? Number(play[1].replace(/,/g, '')) : 0,
    currentPlayCount: current ? Number(current[1].replace(/,/g, '')) : 0,
    dan: Number(danImage.match(/course_rank_(\d+)/)?.[1] ?? 0),
    rank: Number(classImage.match(/class_rank_s_(\d+)/)?.[1] ?? 0),
    stars: Number(stars) || 0,
  };
},records:function parseSegaRecordPage(doc, difficulty) {
  const levels = ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'RE_MASTER'];
  const comboMap = {
    fc: 'FULL_COMBO',
    fcp: 'FULL_COMBO_PLUS',
    ap: 'ALL_PERFECT',
    app: 'ALL_PERFECT_PLUS',
  };
  const syncMap = {
    sync: 'SYNC_PLAY',
    fs: 'FULL_SYNC',
    fsp: 'FULL_SYNC_PLUS',
    fdx: 'FULL_SYNC_DX',
    fdxp: 'FULL_SYNC_DX_PLUS',
  };
  const rows = [...doc.querySelectorAll('div.main_wrapper > div')].filter(
    (el) => el.querySelector('input[name="idx"]') && el.querySelector('div.music_name_block'),
  );
  if (!doc.querySelector('div.main_wrapper'))
    throw new Error('기록 페이지 구조를 확인할 수 없습니다. 로그인을 확인해 주세요.');
  const records = [];
  let unplayed = 0;
  for (const row of rows) {
    const form = row.querySelector('form') ?? row;
    const title = (form.querySelector('div.music_name_block')?.textContent ?? '').trim();
    const blocks = [...form.querySelectorAll('div.music_score_block')];
    if (!blocks.length) {
      unplayed++;
      continue;
    }
    const achievementText = blocks.map((x) => x.textContent ?? '').find((x) => x.includes('%'));
    if (!achievementText)
      throw new Error('달성률 형식이 변경되었습니다. 기록을 저장하지 않았습니다.');
    const achievement = Number(achievementText.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(achievement) || achievement < 0 || achievement > 101)
      throw new Error('허용 범위를 벗어난 달성률입니다.');
    const images = [...row.querySelectorAll('img')].map((i) => i.getAttribute('src') ?? '');
    const kind = row.querySelector('img.music_kind_icon')?.getAttribute('src') ?? '';
    let type = /music_dx/.test(kind) ? 'DX' : /music_standard/.test(kind) ? 'ST' : null;
    if (!type) {
      if (row.querySelector('img.music_kind_icon_standard.pointer')) type = 'DX';
      else if (row.querySelector('img.music_kind_icon_dx.pointer')) type = 'ST';
    }
    // In the tabbed view, the pointer is the other type one can switch to.
    if (!type) throw new Error(`채보 유형을 확인할 수 없습니다: ${title}`);
    const diffFile =
      images.find((s) => /diff_(basic|advanced|expert|master|remaster)\.png/.test(s)) ?? '';
    const parsedDifficulty =
      {
        basic: 'BASIC',
        advanced: 'ADVANCED',
        expert: 'EXPERT',
        master: 'MASTER',
        remaster: 'RE_MASTER',
      }[diffFile.match(/diff_(\w+)\.png/)?.[1]] ?? levels[difficulty];
    let combo = '',
      sync = '';
    for (const src of images) {
      const suffix = src.match(/music_icon_(\w+)\.png/)?.[1];
      if (suffix && comboMap[suffix]) combo = comboMap[suffix];
      if (suffix && syncMap[suffix]) sync = syncMap[suffix];
    }
    const dx = blocks
      .map((x) => x.textContent ?? '')
      .find((x) => x.includes('/'))
      ?.match(/([\d,]+)\s*\/\s*([\d,]+)/);
    records.push({
      title,
      difficulty: parsedDifficulty,
      type,
      displayLevel: (form.querySelector('div.music_lv_block')?.textContent ?? '').trim(),
      achievement,
      combo,
      sync,
      dxScore: dx ? Number(dx[1].replace(/,/g, '')) : 0,
      dxMax: dx ? Number(dx[2].replace(/,/g, '')) : 0,
      imageHash:
        images.map((s) => s.match(/\/Music\/([a-f\d]{16})\.png/i)?.[1]).find(Boolean) ?? null,
      idx: form.querySelector('input[name="idx"]')?.getAttribute('value') ?? '',
    });
  }
  return { records, total: rows.length, unplayed };
},details:function parseSegaDetails(doc) {
  const image =
    [...doc.querySelectorAll('img')]
      .map((i) => i.getAttribute('src') ?? '')
      .find((s) => /\/Music\/[a-f\d]{16}\.png/i.test(s)) ?? '';
  const artist = (
    doc.querySelector('div.main_wrapper > div.basic_block > div.w_250.f_l.t_l > div.m_5.f_15.break')
      ?.textContent ?? ''
  ).trim();
  return { imageHash: image.match(/\/Music\/([a-f\d]{16})\.png/i)?.[1] ?? null, artist };
},targets:function parseSegaTargets(doc) {
  const result = [];
  let group = '';
  for (const el of doc.querySelectorAll('div.main_wrapper > div')) {
    if (el.classList.contains('screw_block')) {
      const text = el.textContent ?? '';
      group = /candidate|selection|候補/i.test(text)
        ? 'candidate'
        : /new|新曲/i.test(text)
          ? 'new'
          : /old|旧曲/i.test(text)
            ? 'old'
            : '';
    }
    const title = el.querySelector('div.music_name_block')?.textContent?.trim();
    if (title && group && group !== 'candidate') {
      const img = [...el.querySelectorAll('img')].map((i) => i.getAttribute('src') ?? '');
      const type = img.some((s) => /music_dx\.png/.test(s)) ? 'DX' : 'ST';
      const match = img.join(' ').match(/diff_(basic|advanced|expert|master|remaster)\.png/);
      const difficulty = {
        basic: 'BASIC',
        advanced: 'ADVANCED',
        expert: 'EXPERT',
        master: 'MASTER',
        remaster: 'RE_MASTER',
      }[match?.[1]];
      if (difficulty) result.push({ title, type, difficulty, group });
    }
  }
  return result;
},stamps:function parseSegaStamps(doc, region = 'intl') {
  const cards = [...doc.querySelectorAll('div[name="type_partner"], div[name="type_other"]')];
  const stampPage =
    doc.querySelector('img[src*="stampcard"]') ||
    /stamp\s*cards?|スタンプカード/i.test(doc.body?.textContent ?? '');
  if (!doc.querySelector('div.main_wrapper') || (!cards.length && !stampPage))
    throw new Error('스탬프 카드 페이지를 확인할 수 없습니다.');
  const groups = {
    partner: 'Partner',
    music: 'Music',
    icon: 'Icon',
    nameplate: 'NamePlate',
    frame: 'Frame',
  };
  return cards.map((card) => {
    const title = card.querySelector('div.stampcard_inner_block')?.textContent?.trim();
    if (!title) throw new Error('스탬프 카드 이름을 확인할 수 없습니다.');
    const background = card.querySelector('img.stampcard_back')?.getAttribute('src') ?? '';
    const type =
      card.getAttribute('name') === 'type_partner'
        ? 'partner'
        : ['music', 'icon', 'nameplate', 'frame', 'ticket'].find((t) => background.includes(t));
    if (!type) throw new Error('스탬프 카드 종류를 확인할 수 없습니다.');
    const maxCount = type === 'icon' ? 5 : 10,
      complete = !!card.querySelector('img.stampcard_comp');
    let stampCount = 0;
    for (const image of card.querySelectorAll('img'))
      for (const name of image.classList) {
        const found = /^stamp_count_(\d+)$/.exec(name);
        if (found) stampCount = Math.max(stampCount, Number(found[1]));
      }
    if (stampCount > maxCount) throw new Error('스탬프 진행 수가 허용 범위를 벗어났습니다.');
    const src = card.querySelector(`img.stampcard_${type}`)?.getAttribute('src') ?? '';
    const group = groups[type];
    const hash = group
      ? new RegExp('/' + group + '/([a-f0-9]{16})\\.png(?:[?#]|$)', 'i').exec(src)?.[1]
      : null;
    if (type !== 'ticket' && !hash) throw new Error('스탬프 보상 이미지를 확인할 수 없습니다.');
    return {
      type,
      displayName: title.slice(0, 300),
      stampCount: complete ? maxCount : stampCount,
      maxCount,
      complete,
      ...(hash ? { image: `/api/art/${region === 'jp' ? 'jp/' : ''}${group}/${hash}.png` } : {}),
    };
  });
}},{"완료":"Done","레이팅":"Rating","기록":"Records","스탬프":"Stamps","레이팅 대상곡":"Best 50","달성률":"Achievement","채보 유형":"Chart type","스탬프 카드":"Stamp cards","개":"cards","연결":"Connect","기록 수집":"Collect records","플레이어":"Player","OpenDX 북마클릿":"OpenDX bookmarklet","{count}개 기록":"{count} records","SEGA 로그인":"SEGA login","저장":"Save","닫기":"Close","플레이어 정보를 읽고 있습니다.":"Reading player information.","난이도별 기록을 읽고 있습니다. ({current}/5)":"Reading records by difficulty. ({current}/5)","동명곡을 구분하고 있습니다. ({current}/{total})":"Matching songs with identical titles. ({current}/{total})","스탬프 카드를 읽고 있습니다.":"Reading stamp cards.","기록 수집 완료":"Collection complete","스탬프 카드는 가져오지 못했습니다. 기존 카드 정보는 유지합니다.":"Stamp cards could not be collected. Existing card data is preserved.","레이팅 대상곡은 가져오지 못했습니다. 기록 자체는 정상적으로 수집했습니다.":"Rating targets could not be collected. Score records were collected successfully.","SEGA 로그인이 만료되었습니다.":"Your SEGA session has expired.","현재 SEGA 점검 중입니다.":"SEGA is currently under maintenance.","수집을 중단했습니다.":"Collection cancelled.","SEGA 응답 시간이 초과되었습니다. 잠시 뒤 다시 실행해 주세요.":"SEGA timed out. Try again shortly.","SEGA에서 오류 페이지를 반환했습니다.":"SEGA returned an error page.","maimai DX NET에 로그인한 후 Aime 카드를 선택하고 OpenDX 북마클릿을 실행해 주세요.":"Sign in to maimai DX NET, select your Aime card, then run the OpenDX bookmarklet.","Aime 카드를 먼저 선택해 주세요.":"Select your Aime card first.","OpenDX 수집이 이미 진행 중입니다.":"OpenDX collection is already running.","OpenDX 가져오기 창에서 시작 버튼을 눌러 주세요.":"Press Start in the OpenDX import window.","중단":"Cancel","가져오기 창을 열어 주세요.":"Open the import window.","OpenDX 창 열기":"Open OpenDX","SEGA 로그인이 만료되었거나 접근할 수 없는 페이지입니다. 다시 로그인해 주세요.":"Your SEGA session expired or this page is unavailable. Sign in again.","SEGA 응답 오류 ({status})":"SEGA response error ({status})","플레이 기록을 찾지 못했습니다. 로그인 상태와 Aime 카드 선택을 확인해 주세요.":"No play records found. Check your login and selected Aime card.","동명곡이 너무 많아 안전하게 중단했습니다. 페이지 형식을 확인해 주세요.":"Stopped because too many songs share a title. Check the page format.","{count}개 기록을 OpenDX로 전달했습니다. 가져오기 창에서 확인하고 저장하세요.":"Sent {count} records to OpenDX. Review and save them in the import window.","연결 대기 시간이 지났습니다. 북마클릿을 다시 실행해 주세요.":"Connection timed out. Run the bookmarklet again.","플레이어 정보를 찾지 못했습니다. SEGA 로그인과 Aime 카드 선택을 확인해 주세요.":"Player information not found. Check your SEGA login and selected Aime card.","기록 페이지 구조를 확인할 수 없습니다. 로그인을 확인해 주세요.":"The records page could not be recognized. Check your login.","달성률 형식이 변경되었습니다. 기록을 저장하지 않았습니다.":"The achievement format changed. No records were saved.","허용 범위를 벗어난 달성률입니다.":"Achievement is outside the allowed range.","스탬프 카드 페이지를 확인할 수 없습니다.":"The stamp card page could not be recognized.","스탬프 카드 이름을 확인할 수 없습니다.":"The stamp card name could not be read.","스탬프 카드 종류를 확인할 수 없습니다.":"The stamp card type could not be recognized.","스탬프 진행 수가 허용 범위를 벗어났습니다.":"Stamp progress is outside the allowed range.","스탬프 보상 이미지를 확인할 수 없습니다.":"The stamp reward image could not be recognized."}); break;
case "ja": (async function collector(targetOrigin, parsers, messages) {
  const t = (key, values = {}) =>
    (messages[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`));
  const allowed = ['https://maimaidx-eng.com', 'https://maimaidx.jp'];
  if (!allowed.includes(location.origin) || !location.pathname.startsWith('/maimai-mobile/')) {
    alert(t('maimai DX NET에 로그인한 후 Aime 카드를 선택하고 OpenDX 북마클릿을 실행해 주세요.'));
    return;
  }
  if (/\/(aimeList|courseDetail)(\/|$)/.test(location.pathname)) {
    alert(t('Aime 카드를 먼저 선택해 주세요.'));
    return;
  }
  if (document.getElementById('opendx-collector')) {
    alert(t('OpenDX 수집이 이미 진행 중입니다.'));
    return;
  }
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
  let popup = window.open(targetOrigin + '/sega-import#' + nonce, 'opendx-import');
  const panel = document.createElement('section');
  panel.id = 'opendx-collector';
  panel.setAttribute(
    'style',
    'position:fixed;z-index:2147483647;bottom:16px;right:16px;max-width:340px;padding:20px;background:#111113;color:#f4f4f5;border:1px solid #444;font:14px/1.6 sans-serif;box-shadow:0 6px 32px #0006;',
  );
  const heading = document.createElement('strong');
  heading.textContent = 'OpenDX';
  heading.style.color = '#baf34a';
  const status = document.createElement('p');
  status.textContent = t('OpenDX 가져오기 창에서 시작 버튼을 눌러 주세요.');
  const cancel = document.createElement('button');
  cancel.textContent = t('중단');
  cancel.setAttribute(
    'style',
    'background:#27272a;color:white;border:1px solid #555;padding:8px 16px;cursor:pointer;',
  );
  panel.append(heading, status, cancel);
  document.body.append(panel);
  const controller = new AbortController();
  let started = false,
    closed = false;
  const send = (type, data = {}) => {
    if (!closed && popup && !popup.closed)
      popup.postMessage({ channel: 'opendx-sega-v1', nonce, type, ...data }, targetOrigin);
  };
  const stop = () => {
    closed = true;
    controller.abort();
    clearInterval(hello);
    window.removeEventListener('message', receive);
    panel.remove();
  };
  cancel.onclick = () => {
    send('CANCELLED');
    stop();
  };
  if (!popup) {
    status.textContent = t('가져오기 창을 열어 주세요.');
    const retry = document.createElement('button');
    retry.textContent = t('OpenDX 창 열기');
    retry.onclick = () => {
      popup = window.open(targetOrigin + '/sega-import#' + nonce, 'opendx-import');
    };
    panel.insertBefore(retry, cancel);
  }
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function get(route) {
    if (controller.signal.aborted) throw new Error(t('수집을 중단했습니다.'));
    const timeout = AbortSignal.timeout(20000);
    const response = await fetch('/maimai-mobile/' + route, {
      credentials: 'same-origin',
      signal: AbortSignal.any([controller.signal, timeout]),
    });
    if (response.status === 401 || response.status === 403)
      throw new Error(
        t('SEGA 로그인이 만료되었거나 접근할 수 없는 페이지입니다. 다시 로그인해 주세요.'),
      );
    if (!response.ok) throw new Error(t('SEGA 응답 오류 ({status})', { status: response.status }));
    if (
      new URL(response.url).origin !== location.origin ||
      !/\/maimai-mobile\//.test(new URL(response.url).pathname)
    )
      throw new Error(t('SEGA 로그인이 만료되었습니다.'));
    const html = await response.text();
    if (/Sorry, servers are under maintenance|ただいまメンテナンス中です/.test(html))
      throw new Error(t('현재 SEGA 점검 중입니다.'));
    if (/(?:ERROR CODE|エラーコード)\s*[：:]/.test(html))
      throw new Error(t('SEGA에서 오류 페이지를 반환했습니다.'));
    return new DOMParser().parseFromString(html, 'text/html');
  }
  async function run() {
    if (started) return;
    started = true;
    clearInterval(hello);
    try {
      status.textContent = t('플레이어 정보를 읽고 있습니다.');
      send('PROGRESS', { message: status.textContent, step: 0, total: 8 });
      const profile = parsers.profile(await get('playerData/'));
      await wait(350);
      const records = [],
        counts = [];
      for (let diff = 0; diff < 5; diff++) {
        status.textContent = t('난이도별 기록을 읽고 있습니다. ({current}/5)', {
          current: diff + 1,
        });
        send('PROGRESS', { message: status.textContent, step: diff + 1, total: 8 });
        const page = parsers.records(
          await get(`record/musicGenre/search/?genre=99&diff=${diff}`),
          diff,
        );
        records.push(...page.records);
        counts.push({ difficulty: diff, listed: page.total, played: page.records.length });
        await wait(350);
      }
      if (!records.length)
        throw new Error(
          t('플레이 기록을 찾지 못했습니다. 로그인 상태와 Aime 카드 선택을 확인해 주세요.'),
        );
      const grouped = new Map();
      for (const r of records) {
        const key = [r.title, r.type, r.difficulty].join('\0');
        const group = grouped.get(key) || [];
        group.push(r);
        grouped.set(key, group);
      }
      const duplicates = [
        ...new Set(
          [...grouped.values()]
            .filter((g) => g.length > 1)
            .flat()
            .map((r) => r.idx),
        ),
      ];
      const detailMap = new Map();
      for (let i = 0; i < duplicates.length; i++) {
        if (i >= 100)
          throw new Error(
            t('동명곡이 너무 많아 안전하게 중단했습니다. 페이지 형식을 확인해 주세요.'),
          );
        status.textContent = t('동명곡을 구분하고 있습니다. ({current}/{total})', {
          current: i + 1,
          total: duplicates.length,
        });
        send('PROGRESS', { message: status.textContent, step: 6, total: 8 });
        const idx = duplicates[i];
        detailMap.set(
          idx,
          parsers.details(await get('record/musicDetail/?idx=' + encodeURIComponent(idx))),
        );
        await wait(350);
      }
      let targets = [],
        warnings = [];
      try {
        targets = parsers.targets(await get('home/ratingTargetMusic/'));
      } catch (e) {
        warnings.push(
          t('레이팅 대상곡은 가져오지 못했습니다. 기록 자체는 정상적으로 수집했습니다.'),
        );
      }
      let stamps;
      status.textContent = t('스탬프 카드를 읽고 있습니다.');
      send('PROGRESS', { message: status.textContent, step: 7, total: 8 });
      await wait(350);
      try {
        stamps = parsers.stamps(
          await get('playerData/stampCard/'),
          location.hostname === 'maimaidx.jp' ? 'jp' : 'intl',
        );
      } catch (e) {
        warnings.push(t('스탬프 카드는 가져오지 못했습니다. 기존 카드 정보는 유지합니다.'));
      }
      if (closed || controller.signal.aborted) return;
      const payload = {
        format: 'opendx-sega/v1',
        region: location.hostname === 'maimaidx.jp' ? 'jp' : 'intl',
        collectedAt: new Date().toISOString(),
        profile,
        counts,
        targets,
        ...(stamps !== undefined ? { stamps } : {}),
        warnings,
        records: records.map(({ idx, ...r }) => ({ ...r, ...detailMap.get(idx) })),
      };
      send('DATA', { payload });
      status.textContent = t(
        '{count}개 기록을 OpenDX로 전달했습니다. 가져오기 창에서 확인하고 저장하세요.',
        { count: records.length.toLocaleString() },
      );
      cancel.textContent = t('닫기');
      send('PROGRESS', { message: t('기록 수집 완료'), step: 8, total: 8 });
    } catch (e) {
      if (!closed) {
        const message =
          e.name === 'AbortError'
            ? t('수집을 중단했습니다.')
            : e.name === 'TimeoutError'
              ? t('SEGA 응답 시간이 초과되었습니다. 잠시 뒤 다시 실행해 주세요.')
              : e.message;
        status.textContent = t(message);
        send('ERROR', { message: t(message) });
        cancel.textContent = t('닫기');
      }
    }
  }
  function receive(event) {
    if (
      event.origin !== targetOrigin ||
      event.source !== popup ||
      event.data?.channel !== 'opendx-sega-v1' ||
      event.data?.nonce !== nonce
    )
      return;
    if (event.data.type === 'START') run();
    if (event.data.type === 'CANCEL') stop();
  }
  window.addEventListener('message', receive);
  const hello = setInterval(() => {
    if (popup?.closed) {
      stop();
      return;
    }
    send('HELLO', { region: location.hostname === 'maimaidx.jp' ? 'jp' : 'intl' });
  }, 600);
  setTimeout(() => {
    if (!started && !closed) {
      status.textContent = t('연결 대기 시간이 지났습니다. 북마클릿을 다시 실행해 주세요.');
      clearInterval(hello);
      window.removeEventListener('message', receive);
    }
  }, 10 * 60000);
})(target,{profile:function parseSegaProfile(doc) {
  const text = (s) => (doc.querySelector(s)?.textContent ?? '').trim();
  const name = text('div.name_block');
  if (!name)
    throw new Error(
      '플레이어 정보를 찾지 못했습니다. SEGA 로그인과 Aime 카드 선택을 확인해 주세요.',
    );
  const body = doc.body.textContent ?? '';
  const play = body.match(/(?:maimaiDX total play count|累計プレイ回数)\s*[：:]\s*([\d,]+)/i);
  const current = body.match(
    /(?:play count of current version|現バージョンプレイ回数)\s*[：:]\s*([\d,]+)/i,
  );
  const image = doc.querySelector('div.basic_block img.w_112')?.getAttribute('src') ?? '';
  const danImage =
    [...doc.querySelectorAll('img')]
      .map((i) => i.getAttribute('src') ?? '')
      .find((s) => /course_rank_\d+/.test(s)) ?? '';
  const classImage =
    [...doc.querySelectorAll('img')]
      .map((i) => i.getAttribute('src') ?? '')
      .find((s) => /class_rank_s_\d+/.test(s)) ?? '';
  const stars = text('div.p_l_10.f_l > div.p_l_10.f_l.f_14').replace(/[^\d]/g, '');
  return {
    name: name.slice(0, 32),
    trophy: text('div.trophy_block > div.trophy_inner_block').slice(0, 100),
    trophyTier: (
      doc
        .querySelector('div.trophy_block')
        ?.className.match(/\btrophy_(Normal|Bronze|Silver|Gold|Rainbow)\b/i)?.[1] ?? 'NORMAL'
    ).toUpperCase(),
    rating: Number(text('div.rating_block').replace(/,/g, '')) || 0,
    imageHash: image.match(/\/Icon\/([a-f\d]{16})\.png/i)?.[1] ?? null,
    playCount: play ? Number(play[1].replace(/,/g, '')) : 0,
    currentPlayCount: current ? Number(current[1].replace(/,/g, '')) : 0,
    dan: Number(danImage.match(/course_rank_(\d+)/)?.[1] ?? 0),
    rank: Number(classImage.match(/class_rank_s_(\d+)/)?.[1] ?? 0),
    stars: Number(stars) || 0,
  };
},records:function parseSegaRecordPage(doc, difficulty) {
  const levels = ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'RE_MASTER'];
  const comboMap = {
    fc: 'FULL_COMBO',
    fcp: 'FULL_COMBO_PLUS',
    ap: 'ALL_PERFECT',
    app: 'ALL_PERFECT_PLUS',
  };
  const syncMap = {
    sync: 'SYNC_PLAY',
    fs: 'FULL_SYNC',
    fsp: 'FULL_SYNC_PLUS',
    fdx: 'FULL_SYNC_DX',
    fdxp: 'FULL_SYNC_DX_PLUS',
  };
  const rows = [...doc.querySelectorAll('div.main_wrapper > div')].filter(
    (el) => el.querySelector('input[name="idx"]') && el.querySelector('div.music_name_block'),
  );
  if (!doc.querySelector('div.main_wrapper'))
    throw new Error('기록 페이지 구조를 확인할 수 없습니다. 로그인을 확인해 주세요.');
  const records = [];
  let unplayed = 0;
  for (const row of rows) {
    const form = row.querySelector('form') ?? row;
    const title = (form.querySelector('div.music_name_block')?.textContent ?? '').trim();
    const blocks = [...form.querySelectorAll('div.music_score_block')];
    if (!blocks.length) {
      unplayed++;
      continue;
    }
    const achievementText = blocks.map((x) => x.textContent ?? '').find((x) => x.includes('%'));
    if (!achievementText)
      throw new Error('달성률 형식이 변경되었습니다. 기록을 저장하지 않았습니다.');
    const achievement = Number(achievementText.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(achievement) || achievement < 0 || achievement > 101)
      throw new Error('허용 범위를 벗어난 달성률입니다.');
    const images = [...row.querySelectorAll('img')].map((i) => i.getAttribute('src') ?? '');
    const kind = row.querySelector('img.music_kind_icon')?.getAttribute('src') ?? '';
    let type = /music_dx/.test(kind) ? 'DX' : /music_standard/.test(kind) ? 'ST' : null;
    if (!type) {
      if (row.querySelector('img.music_kind_icon_standard.pointer')) type = 'DX';
      else if (row.querySelector('img.music_kind_icon_dx.pointer')) type = 'ST';
    }
    // In the tabbed view, the pointer is the other type one can switch to.
    if (!type) throw new Error(`채보 유형을 확인할 수 없습니다: ${title}`);
    const diffFile =
      images.find((s) => /diff_(basic|advanced|expert|master|remaster)\.png/.test(s)) ?? '';
    const parsedDifficulty =
      {
        basic: 'BASIC',
        advanced: 'ADVANCED',
        expert: 'EXPERT',
        master: 'MASTER',
        remaster: 'RE_MASTER',
      }[diffFile.match(/diff_(\w+)\.png/)?.[1]] ?? levels[difficulty];
    let combo = '',
      sync = '';
    for (const src of images) {
      const suffix = src.match(/music_icon_(\w+)\.png/)?.[1];
      if (suffix && comboMap[suffix]) combo = comboMap[suffix];
      if (suffix && syncMap[suffix]) sync = syncMap[suffix];
    }
    const dx = blocks
      .map((x) => x.textContent ?? '')
      .find((x) => x.includes('/'))
      ?.match(/([\d,]+)\s*\/\s*([\d,]+)/);
    records.push({
      title,
      difficulty: parsedDifficulty,
      type,
      displayLevel: (form.querySelector('div.music_lv_block')?.textContent ?? '').trim(),
      achievement,
      combo,
      sync,
      dxScore: dx ? Number(dx[1].replace(/,/g, '')) : 0,
      dxMax: dx ? Number(dx[2].replace(/,/g, '')) : 0,
      imageHash:
        images.map((s) => s.match(/\/Music\/([a-f\d]{16})\.png/i)?.[1]).find(Boolean) ?? null,
      idx: form.querySelector('input[name="idx"]')?.getAttribute('value') ?? '',
    });
  }
  return { records, total: rows.length, unplayed };
},details:function parseSegaDetails(doc) {
  const image =
    [...doc.querySelectorAll('img')]
      .map((i) => i.getAttribute('src') ?? '')
      .find((s) => /\/Music\/[a-f\d]{16}\.png/i.test(s)) ?? '';
  const artist = (
    doc.querySelector('div.main_wrapper > div.basic_block > div.w_250.f_l.t_l > div.m_5.f_15.break')
      ?.textContent ?? ''
  ).trim();
  return { imageHash: image.match(/\/Music\/([a-f\d]{16})\.png/i)?.[1] ?? null, artist };
},targets:function parseSegaTargets(doc) {
  const result = [];
  let group = '';
  for (const el of doc.querySelectorAll('div.main_wrapper > div')) {
    if (el.classList.contains('screw_block')) {
      const text = el.textContent ?? '';
      group = /candidate|selection|候補/i.test(text)
        ? 'candidate'
        : /new|新曲/i.test(text)
          ? 'new'
          : /old|旧曲/i.test(text)
            ? 'old'
            : '';
    }
    const title = el.querySelector('div.music_name_block')?.textContent?.trim();
    if (title && group && group !== 'candidate') {
      const img = [...el.querySelectorAll('img')].map((i) => i.getAttribute('src') ?? '');
      const type = img.some((s) => /music_dx\.png/.test(s)) ? 'DX' : 'ST';
      const match = img.join(' ').match(/diff_(basic|advanced|expert|master|remaster)\.png/);
      const difficulty = {
        basic: 'BASIC',
        advanced: 'ADVANCED',
        expert: 'EXPERT',
        master: 'MASTER',
        remaster: 'RE_MASTER',
      }[match?.[1]];
      if (difficulty) result.push({ title, type, difficulty, group });
    }
  }
  return result;
},stamps:function parseSegaStamps(doc, region = 'intl') {
  const cards = [...doc.querySelectorAll('div[name="type_partner"], div[name="type_other"]')];
  const stampPage =
    doc.querySelector('img[src*="stampcard"]') ||
    /stamp\s*cards?|スタンプカード/i.test(doc.body?.textContent ?? '');
  if (!doc.querySelector('div.main_wrapper') || (!cards.length && !stampPage))
    throw new Error('스탬프 카드 페이지를 확인할 수 없습니다.');
  const groups = {
    partner: 'Partner',
    music: 'Music',
    icon: 'Icon',
    nameplate: 'NamePlate',
    frame: 'Frame',
  };
  return cards.map((card) => {
    const title = card.querySelector('div.stampcard_inner_block')?.textContent?.trim();
    if (!title) throw new Error('스탬프 카드 이름을 확인할 수 없습니다.');
    const background = card.querySelector('img.stampcard_back')?.getAttribute('src') ?? '';
    const type =
      card.getAttribute('name') === 'type_partner'
        ? 'partner'
        : ['music', 'icon', 'nameplate', 'frame', 'ticket'].find((t) => background.includes(t));
    if (!type) throw new Error('스탬프 카드 종류를 확인할 수 없습니다.');
    const maxCount = type === 'icon' ? 5 : 10,
      complete = !!card.querySelector('img.stampcard_comp');
    let stampCount = 0;
    for (const image of card.querySelectorAll('img'))
      for (const name of image.classList) {
        const found = /^stamp_count_(\d+)$/.exec(name);
        if (found) stampCount = Math.max(stampCount, Number(found[1]));
      }
    if (stampCount > maxCount) throw new Error('스탬프 진행 수가 허용 범위를 벗어났습니다.');
    const src = card.querySelector(`img.stampcard_${type}`)?.getAttribute('src') ?? '';
    const group = groups[type];
    const hash = group
      ? new RegExp('/' + group + '/([a-f0-9]{16})\\.png(?:[?#]|$)', 'i').exec(src)?.[1]
      : null;
    if (type !== 'ticket' && !hash) throw new Error('스탬프 보상 이미지를 확인할 수 없습니다.');
    return {
      type,
      displayName: title.slice(0, 300),
      stampCount: complete ? maxCount : stampCount,
      maxCount,
      complete,
      ...(hash ? { image: `/api/art/${region === 'jp' ? 'jp/' : ''}${group}/${hash}.png` } : {}),
    };
  });
}},{"완료":"完了","레이팅":"レーティング","기록":"記録","스탬프":"スタンプ","레이팅 대상곡":"レーティング対象曲","달성률":"達成率","채보 유형":"譜面タイプ","스탬프 카드":"スタンプカード","개":"枚","연결":"接続","기록 수집":"記録を取得","플레이어":"プレイヤー","OpenDX 북마클릿":"OpenDXブックマークレット","{count}개 기록":"{count}件の記録","SEGA 로그인":"SEGAログイン","저장":"保存","닫기":"閉じる","플레이어 정보를 읽고 있습니다.":"プレイヤー情報を読み込んでいます。","난이도별 기록을 읽고 있습니다. ({current}/5)":"難易度別の記録を読み込んでいます。（{current}/5）","동명곡을 구분하고 있습니다. ({current}/{total})":"同名の楽曲を識別しています。（{current}/{total}）","스탬프 카드를 읽고 있습니다.":"スタンプカードを読み込んでいます。","기록 수집 완료":"記録の取得が完了しました","스탬프 카드는 가져오지 못했습니다. 기존 카드 정보는 유지합니다.":"スタンプカードを取得できませんでした。以前のカード情報は保持します。","레이팅 대상곡은 가져오지 못했습니다. 기록 자체는 정상적으로 수집했습니다.":"レーティング対象曲を取得できませんでした。成績の記録は正常に取得しました。","SEGA 로그인이 만료되었습니다.":"SEGAのログインが切れました。","현재 SEGA 점검 중입니다.":"現在SEGAはメンテナンス中です。","수집을 중단했습니다.":"取得を中断しました。","SEGA 응답 시간이 초과되었습니다. 잠시 뒤 다시 실행해 주세요.":"SEGAの応答がタイムアウトしました。しばらくしてから再実行してください。","SEGA에서 오류 페이지를 반환했습니다.":"SEGAがエラーページを返しました。","maimai DX NET에 로그인한 후 Aime 카드를 선택하고 OpenDX 북마클릿을 실행해 주세요.":"maimai DX NETにログインし、Aimeカードを選択してからOpenDXブックマークレットを実行してください。","Aime 카드를 먼저 선택해 주세요.":"先にAimeカードを選択してください。","OpenDX 수집이 이미 진행 중입니다.":"OpenDXの取得はすでに実行中です。","OpenDX 가져오기 창에서 시작 버튼을 눌러 주세요.":"OpenDXの読み込み画面で開始ボタンを押してください。","중단":"中断","가져오기 창을 열어 주세요.":"読み込み画面を開いてください。","OpenDX 창 열기":"OpenDXを開く","SEGA 로그인이 만료되었거나 접근할 수 없는 페이지입니다. 다시 로그인해 주세요.":"SEGAのログインが切れたか、このページにアクセスできません。再度ログインしてください。","SEGA 응답 오류 ({status})":"SEGAの応答エラー（{status}）","플레이 기록을 찾지 못했습니다. 로그인 상태와 Aime 카드 선택을 확인해 주세요.":"プレイ記録が見つかりません。ログイン状態と選択したAimeカードを確認してください。","동명곡이 너무 많아 안전하게 중단했습니다. 페이지 형식을 확인해 주세요.":"同名曲が多すぎるため中断しました。ページの形式を確認してください。","{count}개 기록을 OpenDX로 전달했습니다. 가져오기 창에서 확인하고 저장하세요.":"{count}件の記録をOpenDXに送信しました。読み込み画面で確認して保存してください。","연결 대기 시간이 지났습니다. 북마클릿을 다시 실행해 주세요.":"接続待ちがタイムアウトしました。ブックマークレットを再実行してください。","플레이어 정보를 찾지 못했습니다. SEGA 로그인과 Aime 카드 선택을 확인해 주세요.":"プレイヤー情報が見つかりません。SEGAへのログインと選択したAimeカードを確認してください。","기록 페이지 구조를 확인할 수 없습니다. 로그인을 확인해 주세요.":"記録ページの構造を確認できません。ログイン状態を確認してください。","달성률 형식이 변경되었습니다. 기록을 저장하지 않았습니다.":"達成率の形式が変更されています。記録は保存していません。","허용 범위를 벗어난 달성률입니다.":"達成率が許容範囲外です。","스탬프 카드 페이지를 확인할 수 없습니다.":"スタンプカードのページを確認できません。","스탬프 카드 이름을 확인할 수 없습니다.":"スタンプカードの名前を確認できません。","스탬프 카드 종류를 확인할 수 없습니다.":"スタンプカードの種類を確認できません。","스탬프 진행 수가 허용 범위를 벗어났습니다.":"スタンプ数が許容範囲外です。","스탬프 보상 이미지를 확인할 수 없습니다.":"スタンプ報酬の画像を確認できません。"}); break;
case "zh-TW": (async function collector(targetOrigin, parsers, messages) {
  const t = (key, values = {}) =>
    (messages[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`));
  const allowed = ['https://maimaidx-eng.com', 'https://maimaidx.jp'];
  if (!allowed.includes(location.origin) || !location.pathname.startsWith('/maimai-mobile/')) {
    alert(t('maimai DX NET에 로그인한 후 Aime 카드를 선택하고 OpenDX 북마클릿을 실행해 주세요.'));
    return;
  }
  if (/\/(aimeList|courseDetail)(\/|$)/.test(location.pathname)) {
    alert(t('Aime 카드를 먼저 선택해 주세요.'));
    return;
  }
  if (document.getElementById('opendx-collector')) {
    alert(t('OpenDX 수집이 이미 진행 중입니다.'));
    return;
  }
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
  let popup = window.open(targetOrigin + '/sega-import#' + nonce, 'opendx-import');
  const panel = document.createElement('section');
  panel.id = 'opendx-collector';
  panel.setAttribute(
    'style',
    'position:fixed;z-index:2147483647;bottom:16px;right:16px;max-width:340px;padding:20px;background:#111113;color:#f4f4f5;border:1px solid #444;font:14px/1.6 sans-serif;box-shadow:0 6px 32px #0006;',
  );
  const heading = document.createElement('strong');
  heading.textContent = 'OpenDX';
  heading.style.color = '#baf34a';
  const status = document.createElement('p');
  status.textContent = t('OpenDX 가져오기 창에서 시작 버튼을 눌러 주세요.');
  const cancel = document.createElement('button');
  cancel.textContent = t('중단');
  cancel.setAttribute(
    'style',
    'background:#27272a;color:white;border:1px solid #555;padding:8px 16px;cursor:pointer;',
  );
  panel.append(heading, status, cancel);
  document.body.append(panel);
  const controller = new AbortController();
  let started = false,
    closed = false;
  const send = (type, data = {}) => {
    if (!closed && popup && !popup.closed)
      popup.postMessage({ channel: 'opendx-sega-v1', nonce, type, ...data }, targetOrigin);
  };
  const stop = () => {
    closed = true;
    controller.abort();
    clearInterval(hello);
    window.removeEventListener('message', receive);
    panel.remove();
  };
  cancel.onclick = () => {
    send('CANCELLED');
    stop();
  };
  if (!popup) {
    status.textContent = t('가져오기 창을 열어 주세요.');
    const retry = document.createElement('button');
    retry.textContent = t('OpenDX 창 열기');
    retry.onclick = () => {
      popup = window.open(targetOrigin + '/sega-import#' + nonce, 'opendx-import');
    };
    panel.insertBefore(retry, cancel);
  }
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function get(route) {
    if (controller.signal.aborted) throw new Error(t('수집을 중단했습니다.'));
    const timeout = AbortSignal.timeout(20000);
    const response = await fetch('/maimai-mobile/' + route, {
      credentials: 'same-origin',
      signal: AbortSignal.any([controller.signal, timeout]),
    });
    if (response.status === 401 || response.status === 403)
      throw new Error(
        t('SEGA 로그인이 만료되었거나 접근할 수 없는 페이지입니다. 다시 로그인해 주세요.'),
      );
    if (!response.ok) throw new Error(t('SEGA 응답 오류 ({status})', { status: response.status }));
    if (
      new URL(response.url).origin !== location.origin ||
      !/\/maimai-mobile\//.test(new URL(response.url).pathname)
    )
      throw new Error(t('SEGA 로그인이 만료되었습니다.'));
    const html = await response.text();
    if (/Sorry, servers are under maintenance|ただいまメンテナンス中です/.test(html))
      throw new Error(t('현재 SEGA 점검 중입니다.'));
    if (/(?:ERROR CODE|エラーコード)\s*[：:]/.test(html))
      throw new Error(t('SEGA에서 오류 페이지를 반환했습니다.'));
    return new DOMParser().parseFromString(html, 'text/html');
  }
  async function run() {
    if (started) return;
    started = true;
    clearInterval(hello);
    try {
      status.textContent = t('플레이어 정보를 읽고 있습니다.');
      send('PROGRESS', { message: status.textContent, step: 0, total: 8 });
      const profile = parsers.profile(await get('playerData/'));
      await wait(350);
      const records = [],
        counts = [];
      for (let diff = 0; diff < 5; diff++) {
        status.textContent = t('난이도별 기록을 읽고 있습니다. ({current}/5)', {
          current: diff + 1,
        });
        send('PROGRESS', { message: status.textContent, step: diff + 1, total: 8 });
        const page = parsers.records(
          await get(`record/musicGenre/search/?genre=99&diff=${diff}`),
          diff,
        );
        records.push(...page.records);
        counts.push({ difficulty: diff, listed: page.total, played: page.records.length });
        await wait(350);
      }
      if (!records.length)
        throw new Error(
          t('플레이 기록을 찾지 못했습니다. 로그인 상태와 Aime 카드 선택을 확인해 주세요.'),
        );
      const grouped = new Map();
      for (const r of records) {
        const key = [r.title, r.type, r.difficulty].join('\0');
        const group = grouped.get(key) || [];
        group.push(r);
        grouped.set(key, group);
      }
      const duplicates = [
        ...new Set(
          [...grouped.values()]
            .filter((g) => g.length > 1)
            .flat()
            .map((r) => r.idx),
        ),
      ];
      const detailMap = new Map();
      for (let i = 0; i < duplicates.length; i++) {
        if (i >= 100)
          throw new Error(
            t('동명곡이 너무 많아 안전하게 중단했습니다. 페이지 형식을 확인해 주세요.'),
          );
        status.textContent = t('동명곡을 구분하고 있습니다. ({current}/{total})', {
          current: i + 1,
          total: duplicates.length,
        });
        send('PROGRESS', { message: status.textContent, step: 6, total: 8 });
        const idx = duplicates[i];
        detailMap.set(
          idx,
          parsers.details(await get('record/musicDetail/?idx=' + encodeURIComponent(idx))),
        );
        await wait(350);
      }
      let targets = [],
        warnings = [];
      try {
        targets = parsers.targets(await get('home/ratingTargetMusic/'));
      } catch (e) {
        warnings.push(
          t('레이팅 대상곡은 가져오지 못했습니다. 기록 자체는 정상적으로 수집했습니다.'),
        );
      }
      let stamps;
      status.textContent = t('스탬프 카드를 읽고 있습니다.');
      send('PROGRESS', { message: status.textContent, step: 7, total: 8 });
      await wait(350);
      try {
        stamps = parsers.stamps(
          await get('playerData/stampCard/'),
          location.hostname === 'maimaidx.jp' ? 'jp' : 'intl',
        );
      } catch (e) {
        warnings.push(t('스탬프 카드는 가져오지 못했습니다. 기존 카드 정보는 유지합니다.'));
      }
      if (closed || controller.signal.aborted) return;
      const payload = {
        format: 'opendx-sega/v1',
        region: location.hostname === 'maimaidx.jp' ? 'jp' : 'intl',
        collectedAt: new Date().toISOString(),
        profile,
        counts,
        targets,
        ...(stamps !== undefined ? { stamps } : {}),
        warnings,
        records: records.map(({ idx, ...r }) => ({ ...r, ...detailMap.get(idx) })),
      };
      send('DATA', { payload });
      status.textContent = t(
        '{count}개 기록을 OpenDX로 전달했습니다. 가져오기 창에서 확인하고 저장하세요.',
        { count: records.length.toLocaleString() },
      );
      cancel.textContent = t('닫기');
      send('PROGRESS', { message: t('기록 수집 완료'), step: 8, total: 8 });
    } catch (e) {
      if (!closed) {
        const message =
          e.name === 'AbortError'
            ? t('수집을 중단했습니다.')
            : e.name === 'TimeoutError'
              ? t('SEGA 응답 시간이 초과되었습니다. 잠시 뒤 다시 실행해 주세요.')
              : e.message;
        status.textContent = t(message);
        send('ERROR', { message: t(message) });
        cancel.textContent = t('닫기');
      }
    }
  }
  function receive(event) {
    if (
      event.origin !== targetOrigin ||
      event.source !== popup ||
      event.data?.channel !== 'opendx-sega-v1' ||
      event.data?.nonce !== nonce
    )
      return;
    if (event.data.type === 'START') run();
    if (event.data.type === 'CANCEL') stop();
  }
  window.addEventListener('message', receive);
  const hello = setInterval(() => {
    if (popup?.closed) {
      stop();
      return;
    }
    send('HELLO', { region: location.hostname === 'maimaidx.jp' ? 'jp' : 'intl' });
  }, 600);
  setTimeout(() => {
    if (!started && !closed) {
      status.textContent = t('연결 대기 시간이 지났습니다. 북마클릿을 다시 실행해 주세요.');
      clearInterval(hello);
      window.removeEventListener('message', receive);
    }
  }, 10 * 60000);
})(target,{profile:function parseSegaProfile(doc) {
  const text = (s) => (doc.querySelector(s)?.textContent ?? '').trim();
  const name = text('div.name_block');
  if (!name)
    throw new Error(
      '플레이어 정보를 찾지 못했습니다. SEGA 로그인과 Aime 카드 선택을 확인해 주세요.',
    );
  const body = doc.body.textContent ?? '';
  const play = body.match(/(?:maimaiDX total play count|累計プレイ回数)\s*[：:]\s*([\d,]+)/i);
  const current = body.match(
    /(?:play count of current version|現バージョンプレイ回数)\s*[：:]\s*([\d,]+)/i,
  );
  const image = doc.querySelector('div.basic_block img.w_112')?.getAttribute('src') ?? '';
  const danImage =
    [...doc.querySelectorAll('img')]
      .map((i) => i.getAttribute('src') ?? '')
      .find((s) => /course_rank_\d+/.test(s)) ?? '';
  const classImage =
    [...doc.querySelectorAll('img')]
      .map((i) => i.getAttribute('src') ?? '')
      .find((s) => /class_rank_s_\d+/.test(s)) ?? '';
  const stars = text('div.p_l_10.f_l > div.p_l_10.f_l.f_14').replace(/[^\d]/g, '');
  return {
    name: name.slice(0, 32),
    trophy: text('div.trophy_block > div.trophy_inner_block').slice(0, 100),
    trophyTier: (
      doc
        .querySelector('div.trophy_block')
        ?.className.match(/\btrophy_(Normal|Bronze|Silver|Gold|Rainbow)\b/i)?.[1] ?? 'NORMAL'
    ).toUpperCase(),
    rating: Number(text('div.rating_block').replace(/,/g, '')) || 0,
    imageHash: image.match(/\/Icon\/([a-f\d]{16})\.png/i)?.[1] ?? null,
    playCount: play ? Number(play[1].replace(/,/g, '')) : 0,
    currentPlayCount: current ? Number(current[1].replace(/,/g, '')) : 0,
    dan: Number(danImage.match(/course_rank_(\d+)/)?.[1] ?? 0),
    rank: Number(classImage.match(/class_rank_s_(\d+)/)?.[1] ?? 0),
    stars: Number(stars) || 0,
  };
},records:function parseSegaRecordPage(doc, difficulty) {
  const levels = ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'RE_MASTER'];
  const comboMap = {
    fc: 'FULL_COMBO',
    fcp: 'FULL_COMBO_PLUS',
    ap: 'ALL_PERFECT',
    app: 'ALL_PERFECT_PLUS',
  };
  const syncMap = {
    sync: 'SYNC_PLAY',
    fs: 'FULL_SYNC',
    fsp: 'FULL_SYNC_PLUS',
    fdx: 'FULL_SYNC_DX',
    fdxp: 'FULL_SYNC_DX_PLUS',
  };
  const rows = [...doc.querySelectorAll('div.main_wrapper > div')].filter(
    (el) => el.querySelector('input[name="idx"]') && el.querySelector('div.music_name_block'),
  );
  if (!doc.querySelector('div.main_wrapper'))
    throw new Error('기록 페이지 구조를 확인할 수 없습니다. 로그인을 확인해 주세요.');
  const records = [];
  let unplayed = 0;
  for (const row of rows) {
    const form = row.querySelector('form') ?? row;
    const title = (form.querySelector('div.music_name_block')?.textContent ?? '').trim();
    const blocks = [...form.querySelectorAll('div.music_score_block')];
    if (!blocks.length) {
      unplayed++;
      continue;
    }
    const achievementText = blocks.map((x) => x.textContent ?? '').find((x) => x.includes('%'));
    if (!achievementText)
      throw new Error('달성률 형식이 변경되었습니다. 기록을 저장하지 않았습니다.');
    const achievement = Number(achievementText.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(achievement) || achievement < 0 || achievement > 101)
      throw new Error('허용 범위를 벗어난 달성률입니다.');
    const images = [...row.querySelectorAll('img')].map((i) => i.getAttribute('src') ?? '');
    const kind = row.querySelector('img.music_kind_icon')?.getAttribute('src') ?? '';
    let type = /music_dx/.test(kind) ? 'DX' : /music_standard/.test(kind) ? 'ST' : null;
    if (!type) {
      if (row.querySelector('img.music_kind_icon_standard.pointer')) type = 'DX';
      else if (row.querySelector('img.music_kind_icon_dx.pointer')) type = 'ST';
    }
    // In the tabbed view, the pointer is the other type one can switch to.
    if (!type) throw new Error(`채보 유형을 확인할 수 없습니다: ${title}`);
    const diffFile =
      images.find((s) => /diff_(basic|advanced|expert|master|remaster)\.png/.test(s)) ?? '';
    const parsedDifficulty =
      {
        basic: 'BASIC',
        advanced: 'ADVANCED',
        expert: 'EXPERT',
        master: 'MASTER',
        remaster: 'RE_MASTER',
      }[diffFile.match(/diff_(\w+)\.png/)?.[1]] ?? levels[difficulty];
    let combo = '',
      sync = '';
    for (const src of images) {
      const suffix = src.match(/music_icon_(\w+)\.png/)?.[1];
      if (suffix && comboMap[suffix]) combo = comboMap[suffix];
      if (suffix && syncMap[suffix]) sync = syncMap[suffix];
    }
    const dx = blocks
      .map((x) => x.textContent ?? '')
      .find((x) => x.includes('/'))
      ?.match(/([\d,]+)\s*\/\s*([\d,]+)/);
    records.push({
      title,
      difficulty: parsedDifficulty,
      type,
      displayLevel: (form.querySelector('div.music_lv_block')?.textContent ?? '').trim(),
      achievement,
      combo,
      sync,
      dxScore: dx ? Number(dx[1].replace(/,/g, '')) : 0,
      dxMax: dx ? Number(dx[2].replace(/,/g, '')) : 0,
      imageHash:
        images.map((s) => s.match(/\/Music\/([a-f\d]{16})\.png/i)?.[1]).find(Boolean) ?? null,
      idx: form.querySelector('input[name="idx"]')?.getAttribute('value') ?? '',
    });
  }
  return { records, total: rows.length, unplayed };
},details:function parseSegaDetails(doc) {
  const image =
    [...doc.querySelectorAll('img')]
      .map((i) => i.getAttribute('src') ?? '')
      .find((s) => /\/Music\/[a-f\d]{16}\.png/i.test(s)) ?? '';
  const artist = (
    doc.querySelector('div.main_wrapper > div.basic_block > div.w_250.f_l.t_l > div.m_5.f_15.break')
      ?.textContent ?? ''
  ).trim();
  return { imageHash: image.match(/\/Music\/([a-f\d]{16})\.png/i)?.[1] ?? null, artist };
},targets:function parseSegaTargets(doc) {
  const result = [];
  let group = '';
  for (const el of doc.querySelectorAll('div.main_wrapper > div')) {
    if (el.classList.contains('screw_block')) {
      const text = el.textContent ?? '';
      group = /candidate|selection|候補/i.test(text)
        ? 'candidate'
        : /new|新曲/i.test(text)
          ? 'new'
          : /old|旧曲/i.test(text)
            ? 'old'
            : '';
    }
    const title = el.querySelector('div.music_name_block')?.textContent?.trim();
    if (title && group && group !== 'candidate') {
      const img = [...el.querySelectorAll('img')].map((i) => i.getAttribute('src') ?? '');
      const type = img.some((s) => /music_dx\.png/.test(s)) ? 'DX' : 'ST';
      const match = img.join(' ').match(/diff_(basic|advanced|expert|master|remaster)\.png/);
      const difficulty = {
        basic: 'BASIC',
        advanced: 'ADVANCED',
        expert: 'EXPERT',
        master: 'MASTER',
        remaster: 'RE_MASTER',
      }[match?.[1]];
      if (difficulty) result.push({ title, type, difficulty, group });
    }
  }
  return result;
},stamps:function parseSegaStamps(doc, region = 'intl') {
  const cards = [...doc.querySelectorAll('div[name="type_partner"], div[name="type_other"]')];
  const stampPage =
    doc.querySelector('img[src*="stampcard"]') ||
    /stamp\s*cards?|スタンプカード/i.test(doc.body?.textContent ?? '');
  if (!doc.querySelector('div.main_wrapper') || (!cards.length && !stampPage))
    throw new Error('스탬프 카드 페이지를 확인할 수 없습니다.');
  const groups = {
    partner: 'Partner',
    music: 'Music',
    icon: 'Icon',
    nameplate: 'NamePlate',
    frame: 'Frame',
  };
  return cards.map((card) => {
    const title = card.querySelector('div.stampcard_inner_block')?.textContent?.trim();
    if (!title) throw new Error('스탬프 카드 이름을 확인할 수 없습니다.');
    const background = card.querySelector('img.stampcard_back')?.getAttribute('src') ?? '';
    const type =
      card.getAttribute('name') === 'type_partner'
        ? 'partner'
        : ['music', 'icon', 'nameplate', 'frame', 'ticket'].find((t) => background.includes(t));
    if (!type) throw new Error('스탬프 카드 종류를 확인할 수 없습니다.');
    const maxCount = type === 'icon' ? 5 : 10,
      complete = !!card.querySelector('img.stampcard_comp');
    let stampCount = 0;
    for (const image of card.querySelectorAll('img'))
      for (const name of image.classList) {
        const found = /^stamp_count_(\d+)$/.exec(name);
        if (found) stampCount = Math.max(stampCount, Number(found[1]));
      }
    if (stampCount > maxCount) throw new Error('스탬프 진행 수가 허용 범위를 벗어났습니다.');
    const src = card.querySelector(`img.stampcard_${type}`)?.getAttribute('src') ?? '';
    const group = groups[type];
    const hash = group
      ? new RegExp('/' + group + '/([a-f0-9]{16})\\.png(?:[?#]|$)', 'i').exec(src)?.[1]
      : null;
    if (type !== 'ticket' && !hash) throw new Error('스탬프 보상 이미지를 확인할 수 없습니다.');
    return {
      type,
      displayName: title.slice(0, 300),
      stampCount: complete ? maxCount : stampCount,
      maxCount,
      complete,
      ...(hash ? { image: `/api/art/${region === 'jp' ? 'jp/' : ''}${group}/${hash}.png` } : {}),
    };
  });
}},{"완료":"完成","레이팅":"Rating","기록":"成績","스탬프":"集章","레이팅 대상곡":"Rating 對象譜面","달성률":"達成率","채보 유형":"譜面類型","스탬프 카드":"集章卡","개":"張","연결":"連線","기록 수집":"擷取成績","플레이어":"玩家","OpenDX 북마클릿":"OpenDX 書籤小工具","{count}개 기록":"{count} 筆成績","SEGA 로그인":"SEGA 登入","저장":"儲存","닫기":"關閉","플레이어 정보를 읽고 있습니다.":"正在讀取玩家資訊。","난이도별 기록을 읽고 있습니다. ({current}/5)":"正在依難度讀取成績。（{current}/5）","동명곡을 구분하고 있습니다. ({current}/{total})":"正在區分同名樂曲。（{current}/{total}）","스탬프 카드를 읽고 있습니다.":"正在讀取集章卡。","기록 수집 완료":"成績擷取完成","스탬프 카드는 가져오지 못했습니다. 기존 카드 정보는 유지합니다.":"無法擷取集章卡，已保留既有卡片資料。","레이팅 대상곡은 가져오지 못했습니다. 기록 자체는 정상적으로 수집했습니다.":"無法擷取 Rating 對象譜面，但成績資料已成功擷取。","SEGA 로그인이 만료되었습니다.":"SEGA 登入已逾期。","현재 SEGA 점검 중입니다.":"SEGA 目前正在維護。","수집을 중단했습니다.":"已中止擷取。","SEGA 응답 시간이 초과되었습니다. 잠시 뒤 다시 실행해 주세요.":"SEGA 回應逾時，請稍後重試。","SEGA에서 오류 페이지를 반환했습니다.":"SEGA 傳回錯誤頁面。","maimai DX NET에 로그인한 후 Aime 카드를 선택하고 OpenDX 북마클릿을 실행해 주세요.":"請登入 maimai DX NET 並選擇 Aime 卡，再執行 OpenDX 書籤小工具。","Aime 카드를 먼저 선택해 주세요.":"請先選擇 Aime 卡。","OpenDX 수집이 이미 진행 중입니다.":"OpenDX 已在擷取資料。","OpenDX 가져오기 창에서 시작 버튼을 눌러 주세요.":"請在 OpenDX 匯入視窗按下開始。","중단":"中止","가져오기 창을 열어 주세요.":"請開啟匯入視窗。","OpenDX 창 열기":"開啟 OpenDX","SEGA 로그인이 만료되었거나 접근할 수 없는 페이지입니다. 다시 로그인해 주세요.":"SEGA 登入已逾期或無法存取此頁面，請重新登入。","SEGA 응답 오류 ({status})":"SEGA 回應錯誤（{status}）","플레이 기록을 찾지 못했습니다. 로그인 상태와 Aime 카드 선택을 확인해 주세요.":"找不到遊玩成績，請確認登入狀態與所選的 Aime 卡。","동명곡이 너무 많아 안전하게 중단했습니다. 페이지 형식을 확인해 주세요.":"同名樂曲過多，已中止擷取。請確認頁面格式。","{count}개 기록을 OpenDX로 전달했습니다. 가져오기 창에서 확인하고 저장하세요.":"已傳送 {count} 筆成績至 OpenDX，請在匯入視窗確認並儲存。","연결 대기 시간이 지났습니다. 북마클릿을 다시 실행해 주세요.":"等待連線逾時，請重新執行書籤小工具。","플레이어 정보를 찾지 못했습니다. SEGA 로그인과 Aime 카드 선택을 확인해 주세요.":"找不到玩家資訊，請確認 SEGA 登入狀態與所選的 Aime 卡。","기록 페이지 구조를 확인할 수 없습니다. 로그인을 확인해 주세요.":"無法辨識成績頁面，請確認登入狀態。","달성률 형식이 변경되었습니다. 기록을 저장하지 않았습니다.":"達成率格式已變更，未儲存成績。","허용 범위를 벗어난 달성률입니다.":"達成率超出允許範圍。","스탬프 카드 페이지를 확인할 수 없습니다.":"無法辨識集章卡頁面。","스탬프 카드 이름을 확인할 수 없습니다.":"無法讀取集章卡名稱。","스탬프 카드 종류를 확인할 수 없습니다.":"無法辨識集章卡種類。","스탬프 진행 수가 허용 범위를 벗어났습니다.":"集章進度超出允許範圍。","스탬프 보상 이미지를 확인할 수 없습니다.":"無法辨識集章獎勵圖片。"}); break; }
})();
