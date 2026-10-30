import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, transition, currentQuestion, shuffle, QUESTION_COUNT, REWARDS, AUDIENCE, AUDIENCE_ACCURACY, PHONE_ACCURACY, PHONE_UNSURE, score, reward } from '../quiz/rules.js';
import { createQuestions, createCountScene, FOOD_NAMES } from '../quiz/questions.js';
import { PUMPKINS, PUMPKIN_FAKES, PRODUCE, HAMSTER_QUESTIONS, PREFECTURES } from '../quiz/question-bank.js';
import { FOODS } from '../shiritori/dictionary.js';
import { CueClock } from '../quiz/timeline.js';
const rng = (seed) => () => (seed = (Math.imul(seed,1664525)+1013904223)>>>0)/2**32;
const start = (random = rng(17)) => transition(createGame(random), {type:'start'}, random);
const answer = (s, n) => ['choose','lock','reveal'].reduce((s,type) => transition(s,{type,choice:n}),s);
const correctAnswer = (s) => answer(s,currentQuestion(s).correctChoices.find(i=>!s.removed.includes(i)));
const help = (s, kind, random=()=>.2) => {
  const next=transition(s,{type:'help',kind},random);
  return next.phase==='fifty'?transition(next,{type:'help-done'}):next;
};
const nextQuestion = (s, random=Math.random) => {
  const next=transition(s,{type:'next'},random);
  return next.phase==='count-intro'?transition(next,{type:'count-ready'}):next;
};

test('five valid editable questions and strictly increasing seed rewards', () => {
  const questions=createQuestions(rng(1)); assert.equal(QUESTION_COUNT,5); assert.equal(questions.length,5);
  for(const q of questions){ assert.equal(q.choices.length,4); assert.equal(new Set(q.choices).size,4); assert.ok(Number.isInteger(q.answer)&&q.answer>=0&&q.answer<4); }
  assert.equal(REWARDS.length,6); assert.equal(REWARDS[0],0);
  assert.ok(REWARDS.slice(1).every((n,i)=>n>REWARDS[i]));
});
test('a wrong answer on questions two through five waits for review, then restarts question one and all help', () => {
  for(let failure=1;failure<5;failure++){
    const random=rng(failure+1); let s=start(random);
    for(let i=0;i<failure;i++)s=nextQuestion(correctAnswer(s),random);
    s=help(s,'fifty'); s=help(s,'audience'); s=transition(s,{type:'help-done'});
    s=help(s,'phone'); s=transition(s,{type:'help-done'});
    const q=currentQuestion(s), wrong=[0,1,2,3].find(i=>i!==q.answer&&!s.removed.includes(i));
    s=answer(s,wrong);
    assert.equal(s.phase,'result'); assert.equal(s.index,failure);
    assert.equal(score(s),failure); assert.equal(reward(s),REWARDS[failure]);
    assert.equal(s.answers.at(-1).correct,false);
    s=nextQuestion(s,random);
    assert.equal(s.phase,'question'); assert.equal(s.index,0); assert.equal(score(s),0); assert.equal(reward(s),0);
    assert.equal(s.selected,null); assert.deepEqual(s.removed,[]); assert.deepEqual(s.answers,[]);
    assert.equal(s.votes,null); assert.equal(s.call,null); assert.ok(Object.values(s.used).every(v=>!v));
    assert.equal(transition(s,{type:'next'}),s);
  }
});
test('only five consecutive correct answers finish the game; replay starts cleanly', () => {
  const random=rng(8); let s=start(random);
  for(let i=0;i<5;i++){
    s=correctAnswer(s); assert.equal(s.phase,'result'); assert.equal(score(s),i+1);
    s=nextQuestion(s,random); assert.equal(s.phase,i===4?'finished':'question');
  }
  assert.equal(reward(s),200);
  s=transition(s,{type:'restart'},random); assert.equal(s.phase,'question'); assert.equal(s.index,0); assert.equal(reward(s),0);
});
test('shuffle is non-mutating, reaches all 24 answer orders and all nine hamster seats', () => {
  const original=[0,1,2,3], orders=new Set(), seats=new Set();
  const random=rng(20261030);
  for(let trial=0;trial<500;trial++){
    const s=createGame(random); orders.add(s.order.join(',')); seats.add(s.audience.indexOf('ham'));
    assert.deepEqual([...s.order].sort(),original);
    assert.equal(s.audience.filter(c=>c==='meg').length,5);
    assert.equal(s.audience.filter(c=>c==='ham').length,1);
    assert.equal(s.audience.filter(c=>c==='tapi').length,3);
    const q=currentQuestion(s); assert.equal(q.choices[q.answer],s.questions[0].choices[s.questions[0].answer]);
  }
  assert.equal(orders.size,24); assert.equal(seats.size,9);
  shuffle(original,()=>0); assert.deepEqual(original,[0,1,2,3]); assert.equal(AUDIENCE.length,9);
});
test('answer order stays stable through selection, cancellation and help, and reshuffles at each new question', () => {
  const random=rng(2); let s=start(random); const audience=[...s.audience], orders=[];
  for(let i=0;i<5;i++){
    const order=[...s.order], q=currentQuestion(s); orders.push(order.join(','));
    assert.equal(q.choices[q.answer],s.questions[i].choices[s.questions[i].answer]);
    s=transition(s,{type:'choose',choice:q.answer}); s=transition(s,{type:'back'});
    if(i===0){s=help(s,'fifty');s=help(s,'phone');s=transition(s,{type:'help-done'});}
    assert.deepEqual(s.order,order); assert.deepEqual(s.audience,audience);
    s=nextQuestion(correctAnswer(s),random);
  }
  assert.ok(new Set(orders).size>1);
});
test('selection may be changed until lock; repeated input cannot reveal or score twice', () => {
  let s=start();
  for(const choice of [-1,4,NaN,'0']) assert.equal(transition(s,{type:'choose',choice}),s);
  s=transition(s,{type:'choose',choice:0}); assert.equal(s.phase,'confirm');
  s=transition(s,{type:'back'}); assert.equal(s.selected,null);
  s=transition(s,{type:'choose',choice:1}); s=transition(s,{type:'lock'});
  const frozen=structuredClone(s);
  for(const type of ['choose','back','lock','next','help']) assert.equal(transition(s,{type,choice:0,kind:'fifty'}),s);
  const result=transition(s,{type:'reveal'}); assert.deepEqual(s,frozen);
  assert.equal(transition(result,{type:'reveal'}),result);
});
test('50:50 always leaves the shuffled correct choice and exactly one wrong choice', () => {
  for(const r of [0,.2,.5,.8,.999]) for(let i=1;i<5;i++){
    const s=help({...start(),index:i},'fifty',()=>r);
    assert.equal(s.removed.length,2); assert.ok(!s.removed.includes(currentQuestion(s).answer));
    for(const choice of s.removed) assert.equal(transition(s,{type:'choose',choice}),s);
    assert.equal(help(s,'fifty'),s);
  }
});
test('audience accuracy for factual questions is 60/50/40/30 across 100 equal probability intervals', () => {
  assert.deepEqual(AUDIENCE_ACCURACY,[70,60,50,40,30]);
  for(let index=1;index<5;index++){
    let correct=0; const base={...start(),index}, expected=currentQuestion(base).answer;
    for(let roll=0;roll<100;roll++){
      const s=help(base,'audience',()=>(roll+.5)/100);
      assert.equal(s.votes.length,9); assert.ok(s.votes.every(v=>Number.isInteger(v)&&v>=0&&v<4));
      if(s.votes[0]===expected)correct++;
    }
    assert.equal(correct,AUDIENCE_ACCURACY[index]);
  }
});
test('phone independently classifies correct / unsure / wrong with the requested probabilities', () => {
  assert.deepEqual(PHONE_ACCURACY,[60,50,40,30,20]); assert.deepEqual(PHONE_UNSURE,[0,10,20,30,40]);
  for(let index=1;index<5;index++){
    const count={correct:0,unsure:0,wrong:0}, base={...start(),index}, expected=currentQuestion(base).answer;
    for(let roll=0;roll<100;roll++){
      const s=help(base,'phone',()=>(roll+.5)/100);
      assert.equal(s.call.length,4);
      assert.ok(s.call.every(v=>v===null||(Number.isInteger(v)&&v>=0&&v<4)));
      for(const value of s.call) count[value===null?'unsure':value===expected?'correct':'wrong']++;
    }
    assert.deepEqual(count,{correct:PHONE_ACCURACY[index]*4,unsure:PHONE_UNSURE[index]*4,wrong:160});
  }
  let draws=[.1,.55,.9,.2,.05];
  const mixed=help({...start(),index:1},'phone',()=>draws.shift());
  const expected=currentQuestion(mixed).answer;
  assert.equal(mixed.call[0],expected);assert.equal(mixed.call[1],null);assert.notEqual(mixed.call[2],expected);assert.equal(mixed.call[3],expected);
});
test('after 50:50, each helper uses the boosted probabilities and never chooses removed answers', () => {
  const audience=[75,70,65,60,55], phone=[80,70,60,50,40], unsure=[0,0,5,15,25];
  for(let index=1;index<5;index++)for(const kind of ['audience','phone']){
    const base=help({...start(),index},'fifty'), expected=currentQuestion(base).answer;
    const counts=Array.from({length:kind==='phone'?4:9},()=>({correct:0,unsure:0,wrong:0}));
    for(let roll=0;roll<100;roll++){
      const s=help(base,kind,()=>(roll+.5)/100), opinions=kind==='phone'?s.call:s.votes;
      assert.ok(opinions.every(v=>v===null||!s.removed.includes(v)));
      opinions.forEach((v,i)=>counts[i][v===null?'unsure':v===expected?'correct':'wrong']++);
      assert.equal(transition(s,{type:'choose',choice:expected}),s);
    }
    const correctRate=kind==='phone'?phone[index]:audience[index], unsureRate=kind==='phone'?unsure[index]:0;
    for(const count of counts)assert.deepEqual(count,{correct:correctRate,unsure:unsureRate,wrong:100-correctRate-unsureRate});
  }
});
test('boosted lifelines classify the exact correct and unsure probability boundaries', () => {
  for(let index=1;index<5;index++)for(const kind of ['audience','phone']){
    const base=help({...start(),index},'fifty'), answer=currentQuestion(base).answer;
    const correctRate=(kind==='phone'?[80,70,60,50,40]:[75,70,65,60,55])[index];
    const unsureRate=kind==='phone'?[0,0,5,15,25][index]:0;
    for(const boundary of [correctRate,correctRate+unsureRate])for(const offset of [-.0001,0,.0001]){
      const roll=boundary+offset, s=help(base,kind,()=>roll/100), values=kind==='phone'?s.call:s.votes;
      const expected=roll<correctRate?'correct':roll<correctRate+unsureRate?'unsure':'wrong';
      assert.ok(values.every(v=>(v===null?'unsure':v===answer?'correct':'wrong')===expected));
    }
  }
});
test('the 50:50 boost ends with its question and does not affect help requested before it', () => {
  for(const kind of ['audience','phone']){
    let s=nextQuestion(correctAnswer(start()));
    const opinion=(state)=>kind==='phone'?state.call[0]:state.votes[0];
    const early=help(s,kind,()=>.65);
    assert.notEqual(opinion(early),currentQuestion(early).answer);
    const after=help(s,'fifty');
    assert.equal(opinion(help(after,kind,()=>.65)),currentQuestion(after).answer);
    s=nextQuestion(correctAnswer(after));
    assert.equal(s.used.fifty,true); assert.deepEqual(s.removed,[]);
    assert.notEqual(opinion(help(s,kind,()=>.55)),currentQuestion(s).answer);
    const retry=nextQuestion(answer(s,(currentQuestion(s).answer+1)%4));
    assert.equal(retry.used.fifty,false); assert.deepEqual(retry.removed,[]);
  }
});
test('help can be combined in any order and stays used across successful questions', () => {
  for(const order of [['fifty','audience','phone'],['audience','phone','fifty'],['phone','fifty','audience']]){
    let s=start();
    for(const kind of order){
      s=help(s,kind); s=transition(s,{type:'help-done'});
      if(kind!=='phone')assert.equal(s.call,null);
      if(kind!=='audience')assert.equal(s.votes,null);
    }
    assert.ok(Object.values(s.used).every(Boolean));
    s=nextQuestion(correctAnswer(s));
    assert.deepEqual(s.removed,[]); assert.equal(s.votes,null); assert.equal(s.call,null);
    for(const kind of order)assert.equal(help(s,kind),s);
    assert.equal(help(s,'unknown'),s);
  }
});
test('show clock pauses without skipping cues and fires each cue once, including skip', () => {
  const clock=new CueClock([{at:1400,id:1},{at:3100,id:2},{at:4800,id:3}]);
  assert.deepEqual(clock.advance(1300),[]);
  assert.deepEqual(clock.advance(60000,true),[]); assert.equal(clock.elapsed,1300);
  assert.deepEqual(clock.advance(100).map(c=>c.id),[1]);
  assert.deepEqual(clock.advance(100000).map(c=>c.id),[2,3]); assert.ok(clock.done);
  assert.deepEqual(clock.advance(100000),[]);
});

test('counting introduction locks answers and help until ready, without changing the question or replaying on back', () => {
  const first=correctAnswer(start()), intro=transition(first,{type:'next'});
  assert.equal(intro.phase,'count-intro'); assert.equal(intro.index,1);
  const q=currentQuestion(intro), frozen=structuredClone(intro);
  for(const action of [{type:'choose',choice:0},{type:'help',kind:'fifty'},{type:'next'},{type:'help-done'},{type:'reveal'}])
    assert.equal(transition(intro,action),intro);
  const ready=transition(intro,{type:'count-ready'});
  assert.equal(ready.phase,'question'); assert.deepEqual(currentQuestion(ready),q);
  assert.deepEqual(intro,frozen); assert.equal(transition(ready,{type:'count-ready'}),ready);
  const back=transition(transition(ready,{type:'choose',choice:q.answer}),{type:'back'});
  assert.equal(back.phase,'question'); assert.deepEqual(currentQuestion(back),q);
  assert.equal(transition(correctAnswer(back),{type:'next'}).phase,'question');
  const failed=answer(ready,(q.answer+1)%4);
  const retry=transition(failed,{type:'next'});
  assert.equal(transition(correctAnswer(retry),{type:'next'}).phase,'count-intro');
});

test('50:50 reserves its use once, keeps four choices during the announcement and reveals only on completion', () => {
  for(let index=0;index<5;index++) {
    const original={...start(),index}, pending=transition(original,{type:'help',kind:'fifty'},rng(95));
    const frozen=structuredClone(pending);
    assert.equal(pending.phase,'fifty'); assert.equal(pending.used.fifty,true);
    assert.deepEqual(pending.removed,[]); assert.equal(pending.pendingRemoved.length,2);
    for(const action of [{type:'choose',choice:0},{type:'help',kind:'fifty'},{type:'help',kind:'phone'},{type:'help',kind:'audience'},{type:'next'},{type:'count-ready'}])
      assert.equal(transition(pending,action),pending);
    const done=transition(pending,{type:'help-done'});
    assert.equal(done.phase,'question'); assert.deepEqual(done.removed,pending.pendingRemoved);
    assert.equal(done.pendingRemoved,null); assert.deepEqual(pending,frozen);
    assert.equal(transition(done,{type:'help-done'}),done);
    assert.equal(transition(done,{type:'help',kind:'fifty'}),done);
    assert.ok(currentQuestion(done).correctChoices.some(i=>!done.removed.includes(i)));
  }
});

test('the food joke draws four distinct database foods and accepts every visible answer', () => {
  const source=new Set(FOODS.map(f=>f.name)); assert.equal(FOOD_NAMES.length,source.size);
  for(let seed=1;seed<=30;seed++) {
    const s=start(rng(seed)), q=currentQuestion(s);
    assert.equal(q.kind,'food');assert.equal(new Set(q.choices).size,4);
    assert.ok(q.choices.every(v=>source.has(v)));assert.deepEqual(q.correctChoices,[0,1,2,3]);
    for(let choice=0;choice<4;choice++)assert.equal(answer(s,choice).answers[0].correct,true);
    const two=help(s,'fifty',rng(seed));assert.equal(two.removed.length,2);
    for(const kind of ['phone','audience']) {
      const aided=help(two,kind,rng(seed)), values=kind==='phone'?aided.call:aided.votes;
      assert.ok(values.every(v=>v!==null&&!two.removed.includes(v)));
      for(const choice of [0,1,2,3].filter(v=>!two.removed.includes(v)))assert.equal(answer(two,choice).answers[0].correct,true);
    }
  }
});
test('counting question has exactly 12–15 Megs plus decoys, with fixed ascending choices', () => {
  const counts=new Set();
  for(let seed=1;seed<=200;seed++) {
    const random=rng(seed*761), first=start(random);
    const s=nextQuestion(correctAnswer(first),random), q=currentQuestion(s);
    counts.add(q.count);assert.equal(q.kind,'count');assert.deepEqual(q.choices,['12匹','13匹','14匹','15匹']);
    assert.equal(q.choices[q.answer],q.count+'匹');assert.equal(q.scene.length,20);
    assert.equal(q.scene.filter(f=>f.kind==='meg').length,q.count);
    assert.equal(q.scene.filter(f=>f.kind==='gyoza').length,20-q.count);
    assert.equal(new Set(q.scene.map(f=>f.slot)).size,20);
    assert.ok(q.scene.every(f=>f.pose>=0&&f.pose<4&&f.duration>0));
    let same=transition(s,{type:'choose',choice:0});same=transition(same,{type:'back'});
    assert.deepEqual(currentQuestion(same).scene,q.scene);
  }
  assert.deepEqual([...counts].sort(),[12,13,14,15]);
});
test('factual banks contain the requested variety and each generated question has one distinct answer', () => {
  assert.equal(PUMPKINS.length,5);assert.equal(PUMPKIN_FAKES.length,20);
  assert.equal(PRODUCE.length,20);assert.equal(HAMSTER_QUESTIONS.length,20);assert.equal(new Set(PREFECTURES).size,47);
  assert.ok(PUMPKINS.every(p=>!PUMPKIN_FAKES.includes(p.name)&&p.source.startsWith('https://')));
  assert.ok(PRODUCE.every(p=>PREFECTURES.includes(p.prefecture)&&p.year===2024&&p.source.startsWith('https://')));
  assert.equal(new Set(HAMSTER_QUESTIONS.map(q=>q.id)).size,20);
  for(const q of HAMSTER_QUESTIONS){assert.equal(new Set(q.choices).size,4);assert.ok(q.answer>=0&&q.answer<4&&q.source&&q.explanation);}
  const random=rng(10630), seen=[new Set(),new Set(),new Set()];
  for(let i=0;i<300;i++) {
    const qs=createQuestions(random);
    for(let n=2;n<5;n++){const q=qs[n];assert.equal(new Set(q.choices).size,4);seen[n-2].add(n===2?q.choices[q.answer]:q.id);}
    const pumpkin=qs[2];assert.equal(pumpkin.choices.filter(c=>PUMPKINS.some(p=>p.name===c)).length,1);
    assert.ok(qs[3].choices.every(p=>PREFECTURES.includes(p)));
  }
  assert.deepEqual(seen.map(s=>s.size),[5,20,20]);
});
test('question set persists throughout an attempt and is redrawn after failure and replay', () => {
  const random=rng(318);let s=start(random), old=s.questions;
  s=nextQuestion(correctAnswer(s),random);assert.equal(s.questions,old);
  s=answer(s,(currentQuestion(s).answer+1)%4);s=nextQuestion(s,random);
  assert.notEqual(s.questions,old);assert.equal(s.index,0);assert.equal(s.questions[0].allCorrect,true);
  old=s.questions;
  for(let i=0;i<5;i++)s=nextQuestion(correctAnswer(s),random);
  assert.equal(s.phase,'finished');s=transition(s,{type:'restart'},random);assert.notEqual(s.questions,old);
});

test('counting figures take independent box-wide routes, while every leg stays inside the box', () => {
  for(const random of [rng(831),rng(9),()=>0,()=>.5,()=>.999999]) {
    const scene=createCountScene(14,random);
    assert.equal(scene.filter(f=>f.kind==='meg').length,14);
    for(const figure of scene) {
      assert.equal(figure.route.length,8);
      assert.ok(figure.duration>=24&&figure.duration<=36);
      for(let i=0;i<8;i++) {
        const a=figure.route[i],b=figure.route[(i+1)%8];
        if(i<7)assert.ok(Math.hypot(b.x-a.x,b.y-a.y)>=30-1e-8);
        // CSS interpolates linearly, including the closing leg; sprite size and
        // the small walking tilt have spare space beyond these coordinates.
        for(const t of [0,.25,.5,.75,1]) {
          const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
          assert.ok(x>=4&&x<=79);assert.ok(y>=4&&y<=79);
        }
      }
    }
  }
  const scene=createCountScene(15,rng(20261030));
  assert.equal(new Set(scene.map(f=>JSON.stringify(f.route))).size,20);
  assert.equal(new Set(scene.map(f=>f.duration)).size,20);
});
