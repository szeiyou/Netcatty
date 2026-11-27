import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {I18nProvider} from '../application/i18n/I18nProvider';
import {HostDetailsPanelContent} from './HostDetailsPanel';
import {HostDetailsConnectionSections} from './HostDetailsConnectionSections';
import {HostCreationProtocolSelect} from './host-details/HostCreationProtocolSelect';
import {TooltipProvider} from './ui/tooltip';
import {installDomEnvironment} from './test-support/renderReactDom';

async function withCreation(run:(renderer:ReactTestRenderer)=>Promise<void>) {
 const dom=installDomEnvironment(); let renderer:ReactTestRenderer|undefined;
 const raf=globalThis.requestAnimationFrame,cancelRaf=globalThis.cancelAnimationFrame;
 globalThis.requestAnimationFrame=cb=>setTimeout(()=>cb(0),0) as unknown as number;
 globalThis.cancelAnimationFrame=id=>clearTimeout(id);
 try {
  await act(async()=>{renderer=create(<I18nProvider locale="en"><TooltipProvider><HostDetailsPanelContent availableKeys={[]} identities={[]} groups={[]} terminalThemeId="default" terminalFontSize={14} onSave={()=>{}} onCancel={()=>{}} layout="inline" /></TooltipProvider></I18nProvider>);});
  await run(renderer!);
 } finally {if(renderer) await act(async()=>{renderer!.unmount();}); globalThis.requestAnimationFrame=raf; globalThis.cancelAnimationFrame=cancelRaf; dom.cleanup();}
}
const connection=(renderer:ReactTestRenderer)=>renderer.root.findAllByType(HostDetailsConnectionSections).find(n=>!n.props.advancedOnly)!;

test('compact creation offers standalone RDP and VNC with upstream defaults',async()=>withCreation(async renderer=>{
 const selector=renderer.root.findByType(HostCreationProtocolSelect);
 assert.ok(selector.findAllByType('button').some(b=>b.children.includes('RDP')));
 assert.ok(selector.findAllByType('button').some(b=>b.children.includes('VNC')));
 await act(async()=>{selector.props.onChange('rdp');});
 assert.equal(connection(renderer).props.form.protocol,'rdp');
 assert.equal(connection(renderer).props.form.port,3389);
 assert.equal(connection(renderer).props.form.username,'');
 assert.ok(connection(renderer).props.form.rdpConfig);
 await act(async()=>{renderer.root.findByType(HostCreationProtocolSelect).props.onChange('vnc');});
 assert.equal(connection(renderer).props.form.protocol,'vnc');
 assert.equal(connection(renderer).props.form.port,5900);
 assert.ok(connection(renderer).props.form.vncConfig);
}));

test('selecting a companion protocol preserves a newly selected SSH key',async()=>withCreation(async renderer=>{
 await act(async()=>{connection(renderer).props.update('identityFileId','key-1');});
 await act(async()=>{connection(renderer).props.onSelectProtocolTab('rdp');});
 assert.equal(connection(renderer).props.form.protocol,'ssh');
 assert.equal(connection(renderer).props.form.identityFileId,'key-1');
 assert.equal(connection(renderer).props.activeProtocolTab,'rdp');
 await act(async()=>{connection(renderer).props.onEnableSecondaryProtocol('rdp');});
 assert.equal(connection(renderer).props.form.protocol,'ssh');
 assert.equal(connection(renderer).props.form.identityFileId,'key-1');
 assert.equal(connection(renderer).props.form.rdpConfig.enabled,true);
}));

test('compact creation keeps disabled SSH protocol actions on a configured RDP host',async()=>withCreation(async renderer=>{
 await act(async()=>{renderer.root.findByType(HostCreationProtocolSelect).props.onChange('rdp');});
 await act(async()=>{connection(renderer).props.update('password','rdp-secret');});
 await act(async()=>{connection(renderer).props.onSelectProtocolTab('ssh');});
 assert.equal(connection(renderer).props.form.protocol,'rdp');
 assert.equal(connection(renderer).props.activeProtocolTab,'ssh');
 const text=JSON.stringify(connection(renderer).findAllByType('button').map(b=>b.children.filter(c=>typeof c==='string')));
 assert.match(text,/Add SSH|Switch to SSH/);
}));
