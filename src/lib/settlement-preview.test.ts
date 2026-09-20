import {expect,it} from 'vitest';
import {settlementPreviewHtml} from './settlement-preview';
it('shows persisted replacement terms before the original contract and escapes customer text',()=>{
 const html=settlementPreviewHtml({id:'s',total:900,agreementText:'Revised amount $900 <script>bad</script>',authorizationText:'Authorize $225',scheduleJson:JSON.stringify([{date:'2030-01-07',amount:225}])});
 expect(html).toContain('$900.00');expect(html).toContain('2030-01-07');expect(html).toContain('$225.00');expect(html).toContain('Authorize $225');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');expect(html.indexOf('Revised amount')).toBeLessThan(html.indexOf('<iframe'));expect(html).toContain('/api/settlement-contract/s');
});
