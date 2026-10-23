const { setup, shot, api, staffToken, mobLogin, WEB, MOB } = require('./common');
(async () => {
  const { b, web, mob, errs } = await setup(); global.ERRS = errs; 
  const t = await staffToken();
  await api('/demo/reset', 'POST', {}, t);
  await new Promise(r => setTimeout(r, 1500));
  await mobLogin(mob, 'manny@demo.test');
  await shot(mob, 'A1-home');
  for (const [route, n] of [['/energy', 'A2-energy'], ['/bill', 'A3-bill'], ['/pay', 'A4-pay'], ['/outage', 'A5-outage'], ['/messages', 'A6-inbox']]) {
    await mob.goto(MOB + route); await mob.waitForTimeout(2500); await shot(mob, n);
  }
  await mob.goto(MOB + '/'); await mob.waitForTimeout(2500);
  await web.goto(WEB + '/demo'); await web.waitForTimeout(2500);
  await shot(web, 'A7-demo', true);
  console.log('DEMO TEXT:', (await web.innerText('main')).slice(0, 900));
  const f1before = await api('/feeders/SUB-01-F1', 'GET', null, t);
  await web.getByRole('button', { name: /Simulate EV detected/i }).first().click();
  await mob.waitForTimeout(3500);
  await shot(mob, 'A8-ev-popup');
  console.log('MOB after sim:', (await mob.innerText('body')).slice(0, 400));
  const f1mid = await api('/feeders/SUB-01-F1', 'GET', null, t);
  await web.goto(WEB + '/feeders'); await web.waitForTimeout(2500); await shot(web, 'A9-feeders-live');
  await mob.getByText(/See program/).click(); await mob.waitForTimeout(2000);
  await shot(mob, 'A10-program');
  await mob.getByRole('checkbox').first().click().catch(async () => { await mob.getByText(/I agree/).click(); });
  await mob.waitForTimeout(500);
  await mob.getByText('Enroll now').click(); await mob.waitForTimeout(2500);
  await shot(mob, 'A11-enrolled');
  const f1after = await api('/feeders/SUB-01-F1', 'GET', null, t);
  console.log('F1 known/unenrolled before', f1before.known, f1before.unenrolled, 'mid', f1mid.known, f1mid.unenrolled, 'after', f1after.known, f1after.unenrolled);
  await mob.goto(MOB + '/'); await mob.waitForTimeout(2500); await shot(mob, 'A12-home-enrolled');
  console.log('ERRS', errs.slice(0, 12));
  await b.close();
})().catch(e => { console.error('FAIL', e.message.slice(0,300)); process.exit(1); });
