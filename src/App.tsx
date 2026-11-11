import { useEffect, useMemo, useRef, useState } from 'react';
import { usePersistentState } from './hooks/usePersistentState';
import { apiRequest } from './lib/api';
import {
  Activity, ArrowUpRight, Bell, Bookmark, Check, CircleHelp,
  CreditCard, LayoutDashboard, LockKeyhole, LogOut, Menu, Moon, Search, Settings,
  ShieldCheck, ShoppingBag, SlidersHorizontal, Trash2, Sparkles, Sun, Wallet, X,
  Clock3, MoreHorizontal, Plus, ExternalLink, RefreshCw,
  Link2
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Page = 'Overview' | 'AI Shopping' | 'Saved products' | 'Approvals' | 'Activity' | 'Spending rules' | 'Integrations' | 'Settings';
type Tx = { id:string; approvalId?:string; name:string; detail:string; amount:number; date:string; status:'Completed'|'Pending'|'Approved'|'Declined'|'Failed'; initials:string; tone:string; category:string };
type Rule = { id:string; name:string; description:string; category:string; limit:number; spent:number; enabled:boolean };
type AiResearch = { provider?:string; result:{summary:string;criteria:{label:string;importance:string}[];options:{product:string;merchant:string|null;price:string|null;reason:string;verification:string}[];rejectedAlternatives?:{product:string;reason:string}[];questions:string[];safetyNote:string};products?:ShoppingProduct[];sources:{title:string;url:string}[];note:string };
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential: string }) => void; auto_select?: boolean }) => void;
          renderButton: (element: HTMLElement, options: { theme?: string; size?: string; text?: string; shape?: string; width?: number }) => void;
          cancel: () => void;
        };
      };
    };
    paypal?: {
      Buttons: (options: {
        createOrder: () => Promise<string>;
        onApprove: (data: { orderID: string }) => Promise<void>;
        onCancel?: () => void;
        onError: (error: unknown) => void;
        style?: { layout?: string; color?: string; shape?: string; label?: string };
      }) => { render: (element: HTMLElement) => Promise<void> };
    };
  }
}
type ShoppingProduct = {title:string;url:string;image:string|null;description:string|null;price:string|null;merchant:string;selectionToken?:string};
type SavedProduct = {id:string;title:string;url:string;merchant:string;image:string|null;price:string|null;description:string|null};
type ShoppingChatTurn = {id:number;role:'user'|'assistant';text:string;time:string};
type PayPalReceipt = {receiptNumber:string;transactionId:string;merchant:string;item:string;amountINR:number;amountUSD:number;currency:string;paypalOrderId:string;paypalCaptureId:string;capturedAt:string;status:string;note:string};

function PayPilotMark({size=24}:{size?:number}) {
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M8 25V7.5h8.2c4.8 0 7.8 2.5 7.8 6.5s-3 6.5-7.8 6.5H12" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M20.5 23.5c3.3-1.5 5.5-4.7 5.5-8.5 0-5.2-4.2-9.4-9.4-9.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" opacity=".7"/>
    <circle cx="25.2" cy="7.2" r="2" fill="currentColor"/>
  </svg>;
}


function purchaseCategoryFor(title:string, query:string):string {
  const value=String(title)+' '+String(query);
  if(/\b(book|textbook|notebook)\b/i.test(value)) return 'books & learning';
  if(/\b(software|license|subscription|saas)\b/i.test(value)) return 'software';
  if(/\b(flight|hotel|travel|ticket)\b/i.test(value)) return 'travel';
  if(/\b(laptop|computer|headphone|headset|earbud|phone|smartphone|tablet|monitor|keyboard|mouse|speaker|camera|watch)\b/i.test(value)) return 'electronics';
  return 'shopping';
}
function verifiedINRPrice(price:string|null|undefined):number|null {
  if(!price || !/(?:₹|\bINR\b|\bRs\.?)/i.test(price)) return null;
  const match=price.match(/(?:₹|\bINR\b|\bRs\.?\s*)([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:INR|Rs\.?)/i);
  const value=Number((match?.[1]||match?.[2]||'').replace(/,/g,''));
  return Number.isFinite(value)&&value>0?value:null;
}
function ProductComparison({products,budget}:{products:ShoppingProduct[];budget:number}) {
  if(!products.length) return null;
  const priced=products.map(product=>({product,amount:verifiedINRPrice(product.price)})).filter(item=>item.amount!==null) as {product:ShoppingProduct;amount:number}[];
  const lowest=priced.length?Math.min(...priced.map(item=>item.amount)):null;
  return <section className="ai-comparison"><div className="ai-comparison-heading"><div><span className="eyebrow">SIDE-BY-SIDE ANALYSIS</span><h3>Compare verified seller offers</h3><p>Only INR prices exposed by the seller page are compared. Missing prices are never estimated.</p></div><span>{priced.length} of {products.length} priced</span></div><div className="ai-comparison-scroll"><table><thead><tr><th>Product</th><th>Seller</th><th>Seller price</th><th>Budget check</th><th>Price analysis</th></tr></thead><tbody>{products.map(product=>{const amount=verifiedINRPrice(product.price);const isLowest=amount!==null&&lowest!==null&&amount===lowest;return <tr key={product.url}><td><strong>{product.title}</strong><small>{product.description||'Seller description unavailable'}</small></td><td>{product.merchant}</td><td>{amount!==null?money(amount):<span className="ai-price-unavailable">Not verified</span>}</td><td>{amount===null?'Cannot verify':budget>0?(amount<=budget?<span className="compare-good">Within budget</span>:<span className="compare-warning">Over budget</span>):'Budget not set'}</td><td>{isLowest?<span className="compare-good">Lowest verified price</span>:amount!==null?'Compared offer':'Open seller page to check'}</td></tr>})}</tbody></table></div><p className="ai-comparison-note">Recommendation is based on available seller-page data only. Delivery, taxes, stock, warranty and checkout discounts may change the final price.</p></section>;
}

function ProductImage({src,title}:{src:string|null|undefined;title:string}) {
  const [failed,setFailed] = useState(false);
  if (!src || failed) return <div className="ai-product-image-placeholder"><ShoppingBag size={32}/><span>Seller image unavailable</span></div>;
  return <img src={src} alt={title} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>;
}

const nav = [
  { label:'Overview' as Page, icon:LayoutDashboard, group:'WORKSPACE' },
  { label:'AI Shopping' as Page, icon:ShoppingBag, group:'WORKSPACE' },
  { label:'Saved products' as Page, icon:Bookmark, group:'WORKSPACE' },
  { label:'Approvals' as Page, icon:ShieldCheck, group:'WORKSPACE' },
  { label:'Activity' as Page, icon:Activity, group:'MANAGE' },
  { label:'Spending rules' as Page, icon:SlidersHorizontal, group:'MANAGE' },
  { label:'Integrations' as Page, icon:CreditCard, group:'MANAGE' },
  { label:'Settings' as Page, icon:Settings, group:'PREFERENCES' },
];
const money = (n:number) => '₹' + n.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const budgetFromQuery = (query:string, fallback:number) => { const match=query.match(/(?:under|below|within|max(?:imum)?|budget(?:\s+of)?)\s*(?:₹|rs\.?\s*)?([\d,]+)\s*(k|lakh)?/i); if(!match)return fallback; const amount=Number(match[1].replace(/,/g,'')); return amount*(/k/i.test(match[2]||'')?1000:/lakh/i.test(match[2]||'')?100000:1); };
function PayPalSandboxButton({quoteId,token,onCompleted,onError}:{quoteId:string;token:string;onCompleted:(receipt:PayPalReceipt)=>void;onError:(message:string)=>void}) {
  const buttonRef=useRef<HTMLDivElement>(null);
  const completedRef=useRef(onCompleted);
  const errorRef=useRef(onError);
  useEffect(()=>{completedRef.current=onCompleted;},[onCompleted]);
  useEffect(()=>{errorRef.current=onError;},[onError]);
  const clientId=(import.meta as ImportMeta & {env?:Record<string,string>}).env?.VITE_PAYPAL_CLIENT_ID||'';
  useEffect(()=>{
    if(!clientId||!buttonRef.current)return;
    let cancelled=false;
    let script:HTMLScriptElement|null=null;
    const mount=()=>{
      if(cancelled||!buttonRef.current||!window.paypal)return;
      window.paypal.Buttons({
        style:{layout:'vertical',color:'gold',shape:'rect',label:'paypal'},
        createOrder:async()=>{
          const result=await apiRequest<{orderID:string}>('/api/paypal/orders',token,{method:'POST',body:JSON.stringify({quoteId})});
          return result.orderID;
        },
        onApprove:async(data)=>{
          const result=await apiRequest<{status:string;receipt?:PayPalReceipt;message?:string}>('/api/paypal/capture',token,{method:'POST',body:JSON.stringify({orderID:data.orderID})});
          if(result.status==='COMPLETED'&&result.receipt)completedRef.current(result.receipt);
          else errorRef.current(result.message||'PayPal has not confirmed a completed payment. No success receipt was issued.');
        },
        onCancel:()=>errorRef.current('Checkout was cancelled. No payment was captured.'),
        onError:(error)=>errorRef.current(error instanceof Error?error.message:'PayPal Sandbox checkout encountered an error.'),
      }).render(buttonRef.current).catch(error=>errorRef.current(error instanceof Error?error.message:'Could not load PayPal Sandbox buttons.'));
    };
    const existing=document.querySelector<HTMLScriptElement>('script[data-paypilot-paypal-sdk="true"]');
    if(existing&&window.paypal){mount();}
    else if(existing){existing.addEventListener('load',mount,{once:true});}
    else {
      script=document.createElement('script');
      script.src='https://www.paypal.com/sdk/js?client-id='+encodeURIComponent(clientId)+'&currency=USD&intent=capture';
      script.async=true;
      script.dataset.paypilotPaypalSdk='true';
      script.onload=mount;
      script.onerror=()=>errorRef.current('PayPal Sandbox SDK could not be loaded.');
      document.body.appendChild(script);
    }
    return ()=>{cancelled=true;if(buttonRef.current)buttonRef.current.replaceChildren();};
  },[clientId,quoteId,token]);
  if(!clientId)return <div className="fx-sdk-notice">Add <code>VITE_PAYPAL_CLIENT_ID</code> to the frontend environment to enable the PayPal Sandbox button.</div>;
  return <div className="paypal-sandbox-button-wrap"><div ref={buttonRef}/><small>Sandbox only · USD checkout · No external retailer order is placed</small></div>;
}

const App = () => {
  const [page,setPage] = useState<Page>('Overview');
  const [dark,setDark] = usePersistentState('paypilot:dark',false);
  const [mobileOpen,setMobileOpen] = useState(false);
  const [notice,setNotice] = useState('');
  const [query,setQuery] = useState('');
  const [tx,setTx] = useState<Tx[]>([]);
  const [auditEvents,setAuditEvents] = useState<any[]>([]);
  const [rules,setRules] = useState<Rule[]>([]);
  const [requests,setRequests] = useState<any[]>([]);
  const [modal,setModal] = useState<{type:'approval'|'rule'|'connect'|'transaction'|'fxQuote'|'receipt';id?:string|number}|null>(null);
  const [fxQuote,setFxQuote] = useState<any>(null);
  const [receipt,setReceipt] = useState<PayPalReceipt|null>(null);
  const [newRule,setNewRule] = useState({name:'',limit:'5000',description:'',category:'all'});
  const [filter,setFilter] = useState('All');
  const [connected] = useState<string[]>([]);
  const [budget,setBudget] = usePersistentState('paypilot:budget','40000');
  const [name,setName] = usePersistentState('paypilot:name','');
  const [email,setEmail] = usePersistentState('paypilot:email','');
  const [apiToken,setApiToken] = usePersistentState('paypilot:api-token','');
  const [siteView,setSiteView] = useState<'landing'|'auth'|'dashboard'|'guest-shopping'>(apiToken ? 'dashboard' : 'landing');
  const [authError,setAuthError] = useState('');
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googleClientId = (import.meta as ImportMeta & {env?:Record<string,string>}).env?.VITE_GOOGLE_CLIENT_ID || '';
  const [authLoading,setAuthLoading] = useState(false);
  const [authMode,setAuthMode] = useState<'login'|'register'>('login');
  const [authPassword,setAuthPassword] = useState('');
  const [currentPassword,setCurrentPassword] = useState('');
  const [newPassword,setNewPassword] = useState('');
  const [passwordLoading,setPasswordLoading] = useState(false);
  const [apiError,setApiError] = useState('');
  const [aiResearch,setAiResearch] = useState<AiResearch|null>(null);
  const [aiLoading,setAiLoading] = useState(false);
  const [productSearch,setProductSearch] = useState('wireless headphones');
  const [shoppingChat,setShoppingChat] = useState<ShoppingChatTurn[]>([{id:0,role:'assistant',text:'Hi! Tell me what you want to buy, your budget and what matters most. I’ll research available seller pages and show you what I can verify.',time:'Now'}]);
  const [savedProducts,setSavedProducts] = useState<SavedProduct[]>([]);
  const [shoppingApproval,setShoppingApproval] = useState<any|null>(null);
  const [shoppingStage,setShoppingStage] = useState<'idle'|'protect'|'approved'|'checkout'|'paid'>('idle');
  const [shoppingQuote,setShoppingQuote] = useState<any|null>(null);
  const [shoppingReceipt,setShoppingReceipt] = useState<PayPalReceipt|null>(null);
  const [shoppingBusy,setShoppingBusy] = useState(false);
  const [range,setRange] = usePersistentState('paypilot:chart-range','This week');
  const notify = (s:string) => { setNotice(s); window.setTimeout(()=>setNotice(''),2600); };
  useEffect(() => {
    if (!apiToken) return;
    let active = true;
    apiRequest<{user:{name:string;email:string;monthlyBudget:number}}>('/api/auth/me',apiToken)
      .then(data=>{if(active){setName(data.user.name);setEmail(data.user.email);setBudget(String(data.user.monthlyBudget));setSiteView('dashboard');}})
      .catch(()=>{if(active){setApiToken('');setSiteView('landing');setApiError('Your session expired. Please sign in again.');}});
    return ()=>{active=false;};
  },[apiToken]);
  useEffect(() => {
    if (siteView !== 'dashboard' || !apiToken) return;
    let active = true;
    setApiError('');
    const loadWorkspace = async () => {
      try {
        const [approvalData, ruleData, transactionData, profileData, savedData, auditData] = await Promise.all([
          apiRequest<{approvals:any[]}>('/api/approvals',apiToken),
          apiRequest<{rules:any[]}>('/api/rules',apiToken),
          apiRequest<{transactions:any[]}>('/api/transactions',apiToken),
          apiRequest<{user:{name:string;email:string;monthlyBudget:number}}>('/api/auth/me',apiToken),
          apiRequest<{products:any[]}>('/api/saved-products',apiToken),
          apiRequest<{events:any[]}>('/api/audit',apiToken),
        ]);
        if (!active) return;
        setName(profileData.user.name);
        setEmail(profileData.user.email);
        setBudget(String(profileData.user.monthlyBudget));
        setAuditEvents(auditData.events);
        setSavedProducts(savedData.products.map(p=>({id:p._id,title:p.title,url:p.url,merchant:p.merchant,image:p.image,price:p.price,description:p.description})));
        setRequests(approvalData.approvals.map(a=>({id:a._id,name:a.item,detail:a.merchant+' · '+a.category,amount:a.amount,kind:a.category,icon:(a.merchant||'P').slice(0,1).toUpperCase(),tone:'amber',merchant:a.merchant,status:a.status,createdAt:a.createdAt,userGoal:a.userGoal,recommendationSummary:a.recommendationSummary,recommendationReason:a.recommendationReason,rejectedAlternatives:a.rejectedAlternatives,productUrl:a.productUrl,budgetAtRequest:a.budgetAtRequest,policyCheck:a.policyCheck})));
        setRules(ruleData.rules.map(r=>({id:r._id,name:r.name,description:r.description,category:r.category,limit:r.limit,spent:r.spent,enabled:r.enabled})));
        setTx(transactionData.transactions.map(t=>({id:t._id,approvalId:String(t.approvalId||''),name:t.merchant,detail:t.item,date:t.createdAt,amount:t.amount,status:t.paymentStatus==='COMPLETED'?'Completed':t.status==='payment_pending'||t.paymentStatus==='PENDING'?'Pending':t.status==='payment_failed'||['FAILED','AMOUNT_MISMATCH'].includes(t.paymentStatus)?'Failed':t.status==='approved_pending_payment'?'Approved':'Declined',initials:(t.merchant||'P').slice(0,1).toUpperCase(),tone:'slate',category:t.category})));
      } catch (error) {
        if (active) setApiError(error instanceof Error ? error.message : 'Could not load your account data.');
      }
    };
    void loadWorkspace();
    return () => { active = false; };
  }, [siteView,apiToken]);

  const authenticate = async () => {if(authLoading)return;setAuthLoading(true);setApiError('');try{const data=await apiRequest<{token:string;user:{name:string;email:string}}>('/api/auth/'+authMode,undefined,{method:'POST',body:JSON.stringify({name,email,password:authPassword})});setApiToken(data.token);setName(data.user.name);setEmail(data.user.email);setAuthPassword('');setPage('Overview');setSiteView('dashboard');setAuthError('');setMobileOpen(false);notify(authMode==='register'?'Account created and connected.':'Signed in successfully.');}catch(error){setApiError(error instanceof Error?error.message:'Unable to connect account.');}finally{setAuthLoading(false);}};
  const signOutApi = () => {setApiToken('');setAiResearch(null);setApiError('');setSavedProducts([]);setRequests([]);setRules([]);setTx([]);setName('');setEmail('');setBudget('40000');setPage('Overview');setMobileOpen(false);setQuery('');setSiteView('landing');notify('Signed out successfully.');};
  const saveSettings = async () => {if(!apiToken){notify('Preferences are saved in this browser.');return;}setApiError('');try{const data=await apiRequest<{user:{name:string;email:string;monthlyBudget:number}}>('/api/auth/me',apiToken,{method:'PATCH',body:JSON.stringify({name,monthlyBudget:Number(budget)})});setName(data.user.name);setEmail(data.user.email);setBudget(String(data.user.monthlyBudget));notify('Profile and budget saved to your API account.');}catch(error){setApiError(error instanceof Error?error.message:'Unable to save settings.');}};
  const changePassword = async () => {
    if(newPassword.length<8){setApiError('New password must contain at least 8 characters.');return;}
    setPasswordLoading(true);setApiError('');
    try {
      await apiRequest('/api/auth/password',apiToken,{method:'PATCH',body:JSON.stringify({currentPassword,newPassword})});
      setCurrentPassword('');setNewPassword('');notify('Password updated successfully.');
    } catch(error) { setApiError(error instanceof Error?error.message:'Could not update password.'); }
    finally { setPasswordLoading(false); }
  };
  const runAiResearch = async (searchQuery = productSearch) => {const submittedQuery=searchQuery.trim();if(!submittedQuery||aiLoading)return;setShoppingApproval(null);setShoppingStage('idle');setShoppingQuote(null);setShoppingReceipt(null);setProductSearch(submittedQuery);setAiLoading(true);setApiError('');setShoppingChat(turns=>[...turns,{id:Date.now(),role:'user',text:submittedQuery,time:'Just now'}]);try{const data=await apiRequest<AiResearch>('/api/assistant/plan',apiToken,{method:'POST',body:JSON.stringify({query:submittedQuery,budget:budgetFromQuery(submittedQuery,Number(budget))})});setAiResearch(data);setShoppingChat(turns=>[...turns,{id:Date.now()+1,role:'assistant',text:data.result.summary,time:'Just now'}]);}catch(error){const message=error instanceof Error?error.message:'Shopping research failed. Please try again.';setApiError(message);setShoppingChat(turns=>[...turns,{id:Date.now()+1,role:'assistant',text:message+' You can retry or make your search more specific.',time:'Just now'}]);}finally{setAiLoading(false);}};

  const handleGoogleCredential = async (credential:string) => {
    setAuthLoading(true); setAuthError('');
    try {
      const data=await apiRequest<{token:string;user:{name:string;email:string}}>('/api/auth/google',undefined,{method:'POST',body:JSON.stringify({credential})});
      setApiToken(data.token); setName(data.user.name); setEmail(data.user.email); setPage('Overview'); setSiteView('dashboard'); setMobileOpen(false); setAuthError('');
    } catch(error) { setAuthError(error instanceof Error?error.message:'Google sign-in failed.'); }
    finally { setAuthLoading(false); }
  };
  useEffect(() => {
    if(siteView!=='auth' || !googleClientId) return;
    let attempts=0;
    const render=() => {
      if(!window.google || !googleButtonRef.current) return false;
      googleButtonRef.current.innerHTML='';
      window.google.accounts.id.initialize({client_id:googleClientId,callback:(response)=>void handleGoogleCredential(response.credential)});
      window.google.accounts.id.renderButton(googleButtonRef.current,{theme:'outline',size:'large',text:authMode==='register'?'signup_with':'signin_with',shape:'rectangular',width:320});
      return true;
    };
    if(render()) return;
    const timer=window.setInterval(()=>{attempts+=1;if(render()||attempts>=40)window.clearInterval(timer);},250);
    return ()=>window.clearInterval(timer);
  },[siteView,authMode,googleClientId]);

  const go = (p:Page) => {setPage(p);setMobileOpen(false);window.scrollTo({top:0,behavior:'auto'});};
  const filteredTx = useMemo(()=>tx.filter(t=>(t.name+' '+t.detail+' '+t.category).toLowerCase().includes(query.toLowerCase()) && (filter==='All'||t.status===filter)),[tx,query,filter]);
  const monthlyBudget = Math.max(0,Number(budget)||0);
  const spentAmount = tx.filter(t=>t.status==='Completed').reduce((sum,t)=>sum+t.amount,0);
  const committedAmount = tx.filter(t=>t.status==='Approved'||t.status==='Pending'||t.status==='Failed').reduce((sum,t)=>sum+t.amount,0);
  const chartDays = range==='This week'?7:range==='This month'?new Date().getDate():30;
  const spendingChart = useMemo(()=>{const today=new Date();return Array.from({length:chartDays},(_,index)=>{const date=new Date(today);date.setDate(today.getDate()-chartDays+1+index);const key=date.toDateString();return {day:chartDays===7?date.toLocaleDateString(undefined,{weekday:'short'}):date.toLocaleDateString(undefined,{month:'short',day:'numeric'}),amount:tx.filter(item=>item.status!=='Declined'&&new Date(item.date).toDateString()===key).reduce((sum,item)=>sum+item.amount,0)};});},[tx,chartDays]);
  const totalBudgetUsed = spentAmount + committedAmount;
  const availableBudget = Math.max(0,monthlyBudget-totalBudgetUsed);
  const budgetUsed = monthlyBudget>0?Math.min(100,totalBudgetUsed/monthlyBudget*100):0;
  const pendingCount = requests.filter(a=>a.status==='pending').length;
  const activeApproval = modal?.type==='approval' ? requests.find(a=>a.id===modal.id) : undefined;
  const activeTransaction = modal?.type==='transaction' ? tx.find(t=>t.id===modal.id) : undefined;
  const greeting = new Date().getHours()<12?'Good morning':new Date().getHours()<17?'Good afternoon':'Good evening';
  const refreshWorkspace = async () => {
    const [approvalData,ruleData,transactionData,savedData,auditData] = await Promise.all([
      apiRequest<{approvals:any[]}>('/api/approvals',apiToken),
      apiRequest<{rules:any[]}>('/api/rules',apiToken),
      apiRequest<{transactions:any[]}>('/api/transactions',apiToken),
      apiRequest<{products:any[]}>('/api/saved-products',apiToken),
      apiRequest<{events:any[]}>('/api/audit',apiToken),
    ]);
    setAuditEvents(auditData.events);
    setRequests(approvalData.approvals.map(a=>({id:a._id,name:a.item,detail:a.merchant+' · '+a.category,amount:a.amount,kind:a.category,icon:(a.merchant||'P').slice(0,1).toUpperCase(),tone:'amber',merchant:a.merchant,status:a.status,createdAt:a.createdAt,userGoal:a.userGoal,recommendationSummary:a.recommendationSummary,recommendationReason:a.recommendationReason,rejectedAlternatives:a.rejectedAlternatives,productUrl:a.productUrl,budgetAtRequest:a.budgetAtRequest,policyCheck:a.policyCheck})));
    setSavedProducts(savedData.products.map(p=>({id:p._id,title:p.title,url:p.url,merchant:p.merchant,image:p.image,price:p.price,description:p.description})));
    setRules(ruleData.rules.map(r=>({id:r._id,name:r.name,description:r.description,category:r.category,limit:r.limit,spent:r.spent,enabled:r.enabled})));
    setTx(transactionData.transactions.map(t=>({id:t._id,name:t.merchant,detail:t.item,date:new Date(t.createdAt).toLocaleString(),amount:t.amount,status:t.paymentStatus==='COMPLETED'?'Completed':t.status==='payment_pending'||t.paymentStatus==='PENDING'?'Pending':t.status==='payment_failed'||['FAILED','AMOUNT_MISMATCH'].includes(t.paymentStatus)?'Failed':t.status==='approved_pending_payment'?'Approved':'Declined',initials:(t.merchant||'P').slice(0,1).toUpperCase(),tone:'slate',category:t.category})));
  };
  const openFxQuote = async (id:string) => {
    setApiError('');
    try {
      const data=await apiRequest<{quote:any}>('/api/fx/quotes',apiToken,{method:'POST',body:JSON.stringify({approvalId:id})});
      setFxQuote(data.quote);
      setModal({type:'fxQuote',id:data.quote.id});
    } catch(error) {
      setApiError(error instanceof Error?error.message:'Could not obtain an INR to USD reference-rate estimate.');
    }
  };
  const approve = async (id:string) => {
    try {
      await apiRequest('/api/approvals/'+id,apiToken,{method:'PATCH',body:JSON.stringify({decision:'approved'})});
      await refreshWorkspace();
      setModal(null);
      notify('Purchase approved. Preparing your INR to USD conversion estimate.');
      await openFxQuote(id);
    } catch(error) { setApiError(error instanceof Error?error.message:'Could not approve request.'); }
  };
  const acceptFxQuote = async () => {
    if(!fxQuote?.id)return;
    setApiError('');
    try {
      await apiRequest('/api/fx/quotes/'+fxQuote.id+'/accept',apiToken,{method:'POST'});
      setFxQuote((current:any)=>current?{...current,status:'accepted'}:current);
      notify('Conversion estimate accepted. Continue with PayPal Sandbox checkout below.');
    } catch(error) { setApiError(error instanceof Error?error.message:'Could not accept the conversion estimate.'); }
  };
  const onSandboxPaymentCompleted = async (value:PayPalReceipt) => {
    setReceipt(value);
    if(shoppingApproval){setShoppingReceipt(value);setShoppingStage('paid');}
    else setModal({type:'receipt'});
    notify('PayPal Sandbox capture verified.');
    await refreshWorkspace();
  };
  const onSandboxPaymentError = (message:string) => setApiError(message);
  const decline = async (id:string) => {
    try { await apiRequest('/api/approvals/'+id,apiToken,{method:'PATCH',body:JSON.stringify({decision:'declined'})}); await refreshWorkspace(); setModal(null); notify('Request declined. No payment was made.'); }
    catch(error) { setApiError(error instanceof Error?error.message:'Could not decline request.'); }
  };
  const saveProduct = async (item:NonNullable<AiResearch['products']>[number]) => {
    try {
      await apiRequest('/api/saved-products',apiToken,{method:'POST',body:JSON.stringify({title:item.title,url:item.url,merchant:item.merchant,image:item.image,price:item.price,description:item.description,searchQuery:productSearch})});
      const data=await apiRequest<{products:any[]}>('/api/saved-products',apiToken);
      setSavedProducts(data.products.map(p=>({id:p._id,title:p.title,url:p.url,merchant:p.merchant,image:p.image,price:p.price,description:p.description})));
      notify('Product saved to your account.');
    } catch(error) { setApiError(error instanceof Error?error.message:'Could not save product.'); }
  };
  const requestApprovalForProduct = async (item:NonNullable<AiResearch['products']>[number]) => {
    if(!apiToken){setApiError('Sign in to prepare a protected purchase request.');return;}
    if(!item.selectionToken){setApiError('PayPilot could not verify this seller price in INR. Choose a listing with verified INR pricing or run a fresh search.');return;}
    const priceText=String(item.price||'');
    if(!/(?:₹|\\bINR\\b|\\bRs\\.?\\s*)/i.test(priceText)){setApiError('The seller price must explicitly show INR (₹ or Rs.) before it can enter your INR budget.');return;}
    const priceMatch=priceText.match(/(?:₹|\\bINR\\b|\\bRs\\.?\\s*)([\\d,]+(?:\\.\\d{1,2})?)|([\\d,]+(?:\\.\\d{1,2})?)\\s*(?:INR|Rs\\.?)/i);
    const amount=Number((priceMatch?.[1]||priceMatch?.[2]||'').replace(/,/g,''));
    if(!Number.isFinite(amount)||amount<=0){setApiError('A verified INR seller price is required before requesting approval.');return;}
    setShoppingBusy(true);setApiError('');
    try {
      const chosen=aiResearch?.result.options.find(option=>option.product.toLowerCase()===item.title.toLowerCase());
      const data=await apiRequest<{approval:any;message?:string}>('/api/approvals',apiToken,{method:'POST',body:JSON.stringify({merchant:item.merchant,item:item.title,category:purchaseCategoryFor(item.title,productSearch),amount,userGoal:productSearch,recommendationSummary:aiResearch?.result.summary||'',recommendationReason:chosen?.reason||'Selected from a seller-backed result. Verify final details with the merchant.',rejectedAlternatives:aiResearch?.result.rejectedAlternatives||[],productUrl:item.url,productImage:item.image,currency:'INR',selectionToken:item.selectionToken})});
      setShoppingApproval(data.approval);
      setShoppingStage('protect');
      setShoppingQuote(null);
      setShoppingReceipt(null);
      await refreshWorkspace();
      notify('Purchase prepared. Review the protection checks below.');
    } catch(error) { setApiError(error instanceof Error?error.message:'Could not prepare purchase request.'); }
    finally { setShoppingBusy(false); }
  };
  const approveShoppingPurchase = async () => {
    if(!shoppingApproval?._id||shoppingBusy)return;
    setShoppingBusy(true);setApiError('');
    try {
      await apiRequest('/api/approvals/'+shoppingApproval._id,apiToken,{method:'PATCH',body:JSON.stringify({decision:'approved'})});
      setShoppingApproval((current:any)=>current?{...current,status:'approved'}:current);
      setShoppingStage('approved');
      await refreshWorkspace();
      const data=await apiRequest<{quote:any}>('/api/fx/quotes',apiToken,{method:'POST',body:JSON.stringify({approvalId:shoppingApproval._id})});
      setShoppingQuote(data.quote);
      setShoppingStage('checkout');
      notify('Approval recorded. Review the currency conversion before PayPal checkout.');
    } catch(error) {
      setApiError(error instanceof Error?error.message:'Could not complete the protection or conversion step.');
    } finally { setShoppingBusy(false); }
  };
  const acceptShoppingQuote = async () => {
    if(!shoppingQuote?.id||shoppingBusy)return;
    setShoppingBusy(true);setApiError('');
    try {
      await apiRequest('/api/fx/quotes/'+shoppingQuote.id+'/accept',apiToken,{method:'POST'});
      setShoppingQuote((current:any)=>current?{...current,status:'accepted'}:current);
      notify('Conversion estimate accepted. PayPal Sandbox checkout is ready.');
    } catch(error) { setApiError(error instanceof Error?error.message:'Could not accept the conversion estimate.'); }
    finally { setShoppingBusy(false); }
  };
  const declineShoppingPurchase = async () => {
    if(!shoppingApproval?._id||shoppingBusy)return;
    setShoppingBusy(true);setApiError('');
    try {
      await apiRequest('/api/approvals/'+shoppingApproval._id,apiToken,{method:'PATCH',body:JSON.stringify({decision:'declined'})});
      setShoppingApproval((current:any)=>current?{...current,status:'declined'}:current);
      setShoppingStage('idle');
      await refreshWorkspace();
      notify('Purchase request declined. No payment was made.');
    } catch(error) { setApiError(error instanceof Error?error.message:'Could not decline purchase request.'); }
    finally { setShoppingBusy(false); }
  };
  const removeSavedProduct = async (id:string) => {
    try {
      await apiRequest('/api/saved-products/'+id,apiToken,{method:'DELETE'});
      setSavedProducts(v=>v.filter(p=>p.id!==id));
      notify('Product removed from saved items.');
    } catch(error) { setApiError(error instanceof Error?error.message:'Could not remove saved product.'); }
  };
  const toggleRule = async (id:string) => {
    const rule=rules.find(r=>r.id===id); if(!rule)return;
    try { const data=await apiRequest<{rule:any}>('/api/rules/'+id,apiToken,{method:'PATCH',body:JSON.stringify({enabled:!rule.enabled})}); setRules(v=>v.map(r=>r.id===id?{...r,enabled:data.rule.enabled}:r)); }
    catch(error) { setApiError(error instanceof Error?error.message:'Could not update spending rule.'); }
  };
  const deleteRule = async (id:string) => {
    if(!window.confirm('Delete this spending rule?'))return;
    try {
      await apiRequest('/api/rules/'+id,apiToken,{method:'DELETE'});
      setRules(v=>v.filter(r=>r.id!==id));notify('Spending rule deleted.');
    } catch(error) { setApiError(error instanceof Error?error.message:'Could not delete spending rule.'); }
  };
  const addRule = async () => {
    if(!newRule.name.trim()||!Number.isFinite(Number(newRule.limit))||Number(newRule.limit)<=0)return;
    try {
      const data=await apiRequest<{rule:any}>('/api/rules',apiToken,{method:'POST',body:JSON.stringify(newRule)});
      const r=data.rule; setRules(v=>[{id:r._id,name:r.name,description:r.description,category:r.category,limit:r.limit,spent:r.spent,enabled:r.enabled},...v]);
      setNewRule({name:'',limit:'5000',description:'',category:'all'});setModal(null);notify('Spending rule saved to your account.');
    } catch(error) { setApiError(error instanceof Error?error.message:'Could not create spending rule.'); }
  };
  const transactionRows = (rows:Tx[]) => <div className="transaction-table"><div className="transaction-head"><span>MERCHANT</span><span>DATE</span><span>AMOUNT</span><span>STATUS</span><span/></div>{rows.map(t=><div className="transaction-row" key={t.id}><div className="merchant-cell"><div className={'merchant-logo '+t.tone}>{t.initials}</div><div><strong>{t.name}</strong><span>{t.detail}</span></div></div><span className="date-cell">{new Date(t.date).toLocaleString()}</span><strong className="amount-cell">{t.status==='Completed'?'− ':' '}{money(t.amount)}</strong><span className={'status-badge '+(t.status==='Completed'?'complete':t.status==='Pending'?'pending':t.status==='Approved'?'approved':t.status==='Failed'?'failed':'declined')}><i/>{t.status}</span><button className="row-more" onClick={()=>setModal({type:'transaction',id:t.id})}><MoreHorizontal size={17}/></button></div>)}{rows.length===0&&<div className="empty-search">No transactions match your search.</div>}</div>;

  if(siteView==='landing') return <div className={dark?'public-site paypal-style dark':'public-site paypal-style'}>
    <div className="pp-announcement"><span>MEET A MORE THOUGHTFUL WAY TO SHOP</span><a href="#pp-how">See how PayPilot works <ArrowUpRight size={13}/></a></div>
    <header className="pp-header">
      <div className="pp-header-inner">
        <button className="pp-logo" onClick={()=>setSiteView('landing')} aria-label="PayPilot home"><span className="pp-logo-symbol"><PayPilotMark size={21}/></span><span>PayPilot</span></button>
        <nav className="pp-main-nav"><a href="#pp-shopping">What you can do</a><a href="#pp-how">How it works</a><a href="#pp-control">Our approach</a></nav>
        <div className="pp-header-actions">
          {apiToken&&<button className="pp-dashboard-link" onClick={()=>setSiteView('dashboard')}>Dashboard</button>}
          <button className="pp-login" onClick={()=>{setAuthMode('login');setSiteView('auth');}}>Log in</button>
          <button className="pp-signup" onClick={()=>{setAuthMode('register');setSiteView('auth');}}>Get started</button>
        </div>
      </div>
    </header>
    <main>
      <section className="pp-hero pp-hero-video-layout">
        <div className="pp-hero-inner">
          <div className="pp-hero-copy">
            <div className="pp-kicker"><span/> A BETTER WAY TO DECIDE</div>
            <h1>Good purchases start with <em>good decisions.</em></h1>
            <p>Meet the shopping assistant that helps you research what matters, compare your options and stay close to your budget.</p>
            <div className="pp-hero-buttons">
              <button className="pp-blue-button" onClick={()=>{setPage('AI Shopping');setSiteView('guest-shopping');}}>Try PayPilot free <ArrowUpRight size={17}/></button>
              <a className="pp-text-button" href="#pp-how">See how it works <ArrowUpRight size={15}/></a>
            </div>
            <div className="pp-hero-assurance"><ShieldCheck size={17}/><span>No automatic purchases. Your decision always comes first.</span></div>
          </div>
          <div className="pp-hero-video" aria-hidden="true">
            <video className="pp-hero-video-media" autoPlay muted loop playsInline preload="metadata" poster="https://images.pexels.com/photos/6213998/pexels-photo-6213998.jpeg?auto=compress&cs=tinysrgb&w=1800">
              <source src="https://videos.pexels.com/video-files/8937981/8937981-hd_1920_1080_30fps.mp4" type="video/mp4"/>
            </video>
            <div className="pp-hero-video-overlay"/>
            <div className="pp-hero-video-caption"><span>SHOP WITH MORE CLARITY</span><span>PAYPILOT AI</span></div>
          </div>
        </div>
      </section>
      <section className="pp-proofbar"><div><strong>Less guesswork.</strong><span>More useful research.</span></div><div><Search size={19}/><span>Explore options</span></div><div><Wallet size={19}/><span>Respect your budget</span></div><div><ShieldCheck size={19}/><span>Stay in control</span></div></section>
      <section className="pp-intro-section" id="pp-shopping">
        <div className="pp-intro-heading"><div className="pp-kicker">SHOPPING, WITH A PLAN</div><h2>From “I need this” to “I know what to choose.”</h2></div>
        <p>Buying something online shouldn't mean opening twenty tabs, second-guessing prices or losing sight of your budget. PayPilot helps bring the important details together.</p>
      </section>
      <section className="pp-feature-stack">
        <article className="pp-feature-block">
          <div className="pp-feature-image"><img src="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1100&q=85" alt="Wireless headphones product detail"/><div className="pp-image-label">01 — RESEARCH WITH CONTEXT</div></div>
          <div className="pp-feature-text"><span className="pp-feature-index">01 / FIND YOUR FIT</span><h3>Research that starts with what you actually need.</h3><p>Tell PayPilot what you're shopping for, what matters most and how much you want to spend. Explore AI-assisted research and the sources behind it.</p><button className="pp-inline-link" onClick={()=>{setPage('AI Shopping');setSiteView('guest-shopping');}}>Explore AI shopping <ArrowUpRight size={16}/></button></div>
        </article>
        <article className="pp-feature-block pp-feature-reverse">
          <div className="pp-feature-image"><img src="https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=1100&q=85" alt="Laptop on a clean desk for planning and comparing purchases"/><div className="pp-image-label">02 — MAKE YOUR BUDGET WORK</div></div>
          <div className="pp-feature-text"><span className="pp-feature-index">02 / KEEP PERSPECTIVE</span><h3>A budget isn't a restriction. It's your plan.</h3><p>Set spending limits that make sense for you. Keep your budget visible while you compare products and think through the trade-offs.</p><button className="pp-inline-link" onClick={()=>{setAuthMode('register');setSiteView('auth');}}>Create your account <ArrowUpRight size={16}/></button></div>
        </article>
        <article className="pp-feature-block">
          <div className="pp-feature-image pp-feature-image-approval"><img src="https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=1100&q=85" alt="Customer reviewing a purchase before completing checkout"/><div className="pp-image-label">03 — YOU MAKE THE CALL</div></div>
          <div className="pp-feature-text"><span className="pp-feature-index">03 / STAY IN CONTROL</span><h3>Helpful recommendations. Never decisions made for you.</h3><p>PayPilot is designed to help you prepare, not take over. It does not place orders or send payments. You remain in charge of every next step.</p><a className="pp-inline-link" href="#pp-control">Our approach to control <ArrowUpRight size={16}/></a></div>
        </article>
      </section>
      <section className="pp-product-band"><div className="pp-product-band-inner"><div className="pp-product-band-copy"><div className="pp-kicker">MADE TO FEEL SIMPLE</div><h2>Your shopping research.<br/><em>All in one place.</em></h2><p>Move from a question to a clearer shortlist with a focused workspace for product research, comparisons and spending preferences.</p><button className="pp-blue-button" onClick={()=>{setPage('AI Shopping');setSiteView('guest-shopping');}}>Start exploring <ArrowUpRight size={16}/></button></div><div className="pp-app-preview"><div className="pp-app-top"><span><i/> PayPilot</span><span>AI SHOPPING</span></div><div className="pp-app-greeting">Let's find the right fit.</div><div className="pp-app-search"><Search size={16}/><span>Headphones for work under ₹10,000</span><ArrowUpRight size={15}/></div><div className="pp-app-meta"><span>YOUR PREFERENCES</span><span>EDIT SEARCH</span></div><div className="pp-app-chips"><i>Noise cancelling</i><i>Comfortable</i><i>Long battery</i></div><div className="pp-app-list-title"><strong>Research checklist</strong><span>Based on your search</span></div><div className="pp-app-list-row"><span className="pp-app-thumb">01</span><span><b>Compare sound quality</b><small>Features, reviews and fit</small></span><Check size={16}/></div><div className="pp-app-list-row"><span className="pp-app-thumb">02</span><span><b>Check current pricing</b><small>Review retailer sources</small></span><Check size={16}/></div><div className="pp-app-list-row"><span className="pp-app-thumb">03</span><span><b>Stay within your budget</b><small>Your limit stays in view</small></span><Check size={16}/></div><div className="pp-app-disclaimer">Illustrative product interface · Not live prices or product listings</div></div></div></section>
      <section className="pp-how-section" id="pp-how"><div className="pp-how-inner"><div className="pp-kicker">A CLEARER WAY FORWARD</div><h2>Three steps to a more confident choice.</h2><div className="pp-steps"><article><span>01</span><div><h3>Tell us what you're after.</h3><p>Share the product, your priorities and the budget you're working with.</p></div></article><article><span>02</span><div><h3>Explore the research.</h3><p>Review relevant options, useful details and available source links.</p></div></article><article><span>03</span><div><h3>Make the call yourself.</h3><p>Choose what works for you. PayPilot never completes a purchase automatically.</p></div></article></div></div></section>
      <section className="pp-control-section" id="pp-control"><div className="pp-control-photo"><img src="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1000&q=80" alt="A customer making their own payment decision"/></div><div className="pp-control-copy"><div className="pp-kicker">YOUR CHOICE. YOUR CONTROL.</div><h2>Technology should support your decisions, <em>not make them.</em></h2><p>PayPilot is an AI shopping research and budgeting assistant. It is not a payment processor, and it will not check out or spend money on your behalf.</p><div className="pp-control-points"><span><Check size={16}/> You review the research</span><span><Check size={16}/> You set your budget</span><span><Check size={16}/> You make the final decision</span></div></div></section>
      <section className="pp-bottom-cta"><div className="pp-kicker">YOUR NEXT PURCHASE STARTS HERE</div><h2>Take a moment. Make a better choice.</h2><p>Try AI shopping with no account required. Sign up when you're ready to save your preferences.</p><div><button className="pp-blue-button" onClick={()=>{setPage('AI Shopping');setSiteView('guest-shopping');}}>Try PayPilot free <ArrowUpRight size={16}/></button><button className="pp-cta-secondary" onClick={()=>{setAuthMode('register');setSiteView('auth');}}>Create an account</button></div></section>
    </main>
    <footer className="pp-footer"><div className="pp-footer-inner"><div className="pp-footer-brand"><button className="pp-logo" onClick={()=>setSiteView('landing')}><span className="pp-logo-symbol"><PayPilotMark size={21}/></span><span>PayPilot</span></button><p>Make more informed purchase decisions.</p></div><div className="pp-footer-links"><div><strong>EXPLORE</strong><a href="#pp-shopping">What you can do</a><a href="#pp-how">How it works</a></div><div><strong>YOUR ACCOUNT</strong><button onClick={()=>{setAuthMode('login');setSiteView('auth');}}>Log in</button><button onClick={()=>{setAuthMode('register');setSiteView('auth');}}>Get started</button>{apiToken&&<button onClick={()=>setSiteView('dashboard')}>Dashboard</button>}</div><div><strong>PAYPILOT</strong><a href="#pp-control">Our approach</a><button onClick={()=>{setPage('AI Shopping');setSiteView('guest-shopping');}}>Guest shopping</button></div></div><div className="pp-footer-bottom"><span>© 2026 PayPilot. All rights reserved.</span><span>AI-assisted research. Human-led decisions.</span></div></div></footer>
  </div>;
  if(siteView==='auth') return <div className={dark?'auth-page dark':'auth-page'}><button className="auth-back-brand" onClick={()=>setSiteView('landing')}><span className="public-brand-mark"><PayPilotMark size={21}/></span> paypilot<span>AI</span></button><div className="auth-card"><div className="auth-mark"><PayPilotMark size={24}/></div><div className="public-eyebrow">{authMode==='login'?'WELCOME BACK':'GET STARTED'}</div><h1>{authMode==='login'?'Sign in to PayPilot':'Create your account'}</h1><p>{authMode==='login'?'Continue to your personal shopping and finance workspace.':'Save your preferences and manage your shopping workspace.'}</p><div className="auth-switch"><button className={authMode==='login'?'active':''} onClick={()=>{setAuthMode('login');setAuthError('');}}>Sign in</button><button className={authMode==='register'?'active':''} onClick={()=>{setAuthMode('register');setAuthError('');}}>Create account</button></div>{authMode==='register'&&<label className="auth-field">Full name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" autoComplete="name"/></label>}<label className="auth-field">Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"/></label><label className="auth-field">Password<input type="password" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} placeholder="At least 8 characters" autoComplete={authMode==='login'?'current-password':'new-password'}/></label><button className="auth-submit" onClick={authenticate} disabled={authLoading||!email.trim()||authPassword.length<8}>{authLoading?'Please wait…':authMode==='login'?'Sign in':'Create account'}</button><div className="auth-divider"><span/>or continue with<span/></div>{googleClientId?<div className="google-button-host" ref={googleButtonRef}/>:<><button type="button" className="google-fallback-button" onClick={()=>setAuthError('Google sign-in needs a Google OAuth Web Client ID. Add VITE_GOOGLE_CLIENT_ID to the frontend and GOOGLE_CLIENT_ID to the backend environment, then redeploy.')}><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.5 13.3l7.8 6.1C12.2 13.5 17.6 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.6 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1Z"/><path fill="#FBBC05" d="M10.3 28.6a14.4 14.4 0 0 1 0-9.2l-7.8-6.1a24 24 0 0 0 0 21.4l7.8-6.1Z"/><path fill="#34A853" d="M24 48c6.5 0 12-2.1 16-5.8l-7.4-5.7c-2.1 1.4-4.9 2.2-8.6 2.2-6.4 0-11.8-4-13.7-9.5l-7.8 6.1C6.5 43 14.6 48 24 48Z"/></svg>Continue with Google</button><small className="auth-config-note">Google account sign-in is ready to enable once the OAuth client ID is added.</small></>}{authError&&<div className="api-error">{authError}</div>}<small className="auth-terms">By continuing, you agree to use PayPilot responsibly. Your account details are handled securely.</small></div><button className="auth-back-link" onClick={()=>{setSiteView('guest-shopping');setPage('AI Shopping');}}>Continue as guest to AI shopping</button></div>;
  if(siteView==='guest-shopping') return <div className={dark?'guest-page dark':'guest-page'}><header className="guest-header"><button className="public-brand" onClick={()=>setSiteView('landing')}><span className="public-brand-mark"><PayPilotMark size={21}/></span> paypilot<span>AI</span></button><div><span className="guest-label">GUEST SHOPPING</span><button className="public-link" onClick={()=>{setAuthMode('login');setSiteView('auth');}}>Sign in</button><button className="public-nav-cta" onClick={()=>{setAuthMode('register');setSiteView('auth');}}>Create account</button></div></header><main className="guest-main"><button className="guest-back" onClick={()=>setSiteView('landing')}>← Back to website</button><div className="public-eyebrow">AI SHOPPING ASSISTANT</div><h1>What are you looking for?</h1><p>Search freely as a guest. No account required.</p><div className="guest-search"><input value={productSearch} onChange={e=>setProductSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void runAiResearch();}} placeholder="e.g. laptop for coding under ₹60,000"/><button className="public-primary" onClick={()=>void runAiResearch()} disabled={aiLoading||!productSearch.trim()}>{aiLoading?'Researching…':'Search the web'} <Search size={16}/></button></div><div className="suggestion-chips"><button onClick={()=>setProductSearch('Laptop for coding under ₹60,000')}>Laptop under ₹60,000</button><button onClick={()=>setProductSearch('Wireless headphones under ₹5,000')}>Wireless headphones</button><button onClick={()=>setProductSearch('Smartphone with good camera under ₹25,000')}>Smartphone under ₹25,000</button></div>{apiError&&<div className="api-error">{apiError}</div>}{aiResearch&&<section className="panel guest-results"><div className="panel-heading"><div><h2>Research results</h2><p>{aiResearch.provider||'Web research'}</p></div><button className="text-action" onClick={()=>setAiResearch(null)}>Clear</button></div><p className="ai-research-summary">{aiResearch.result.summary}</p>{aiResearch.products&&aiResearch.products.length>0?<> <div className="ai-visual-products"><div className="ai-products-heading"><div><h3>Products found on shopping sites</h3><p>Details are taken from the seller page where available.</p></div><span>{aiResearch.products.length} results</span></div><div className="ai-product-grid">{aiResearch.products.map(item=><article className="ai-product-card" key={item.url}><a className="ai-product-image" href={item.url} target="_blank" rel="noreferrer"><ProductImage src={item.image} title={item.title}/></a><div className="ai-product-card-body"><span className="ai-product-merchant">{item.merchant}</span><h4>{item.title}</h4>{item.price?<strong className="ai-product-price">{item.price}</strong>:<span className="ai-price-unavailable">Price not verified on page</span>}{item.description&&<p>{item.description}</p>}<a className="ai-product-view-link" href={item.url} target="_blank" rel="noreferrer">View on seller website <ExternalLink size={13}/></a><button className="text-action guest-purchase-cta" onClick={()=>{if(apiToken){setSiteView('dashboard');setPage('AI Shopping');}else{setAuthMode('login');setSiteView('auth');}}}>{apiToken?'Continue in workspace':'Sign in to save or request approval'}</button></div></article>)}</div></div><ProductComparison products={aiResearch.products} budget={budgetFromQuery(productSearch,Number(budget))}/></>:<div className="ai-no-products"><strong>No verified individual product listings found</strong><span>PayPilot has filtered out category pages and buying guides rather than showing them as products. Try searching for a specific laptop model or a retailer product page.</span></div>}{shoppingApproval&&shoppingStage!=='idle'&&<section className="shopping-purchase-flow panel" aria-live="polite">
  <div className="shopping-flow-heading"><div><span className="eyebrow">YOUR PURCHASE JOURNEY</span><h3>Protect, approve and pay — in this shopping session</h3><p>Every stage is checked by the backend. Nothing is paid until you approve and complete PayPal Sandbox checkout.</p></div><span className={'shopping-flow-status '+(shoppingStage==='paid'?'is-complete':'')}>{shoppingStage==='paid'?'Payment verified':shoppingStage==='checkout'?'Checkout ready':shoppingStage==='approved'?'Approved':'Review required'}</span></div>
  <div className="shopping-flow-steps"><span className="done">01 Research</span><span className="done">02 Compare</span><span className={shoppingStage==='protect'?'current':'done'}>03 Protect</span><span className={shoppingStage==='protect'?'':'current'}>04 Approve</span><span className={shoppingStage==='checkout'||shoppingStage==='paid'?'done':'waiting'}>05 Pay & verify</span></div>
  <div className="shopping-flow-product"><div><small>SELECTED PRODUCT</small><strong>{shoppingApproval.item}</strong><span>{shoppingApproval.merchant} · Seller listing price</span></div><strong>{money(shoppingApproval.amount)}</strong></div>
  {shoppingStage==='protect'&&<><div className="shopping-protection-grid"><div><span>Monthly budget</span><strong>{money(Number(budget)||0)}</strong></div><div><span>Purchase amount</span><strong>{money(shoppingApproval.amount)}</strong></div><div><span>Budget after this request</span><strong>{money(Math.max(0,(Number(budget)||0)-shoppingApproval.amount))}</strong></div></div><div className="shopping-policy-result"><ShieldCheck size={18}/><div><strong>Backend spending checks passed</strong><span>{shoppingApproval.policyCheck?.withinMonthlyBudget===false?'Monthly budget needs review.':'This request passed your monthly budget check.'} {shoppingApproval.policyCheck?.matchedRules?.length? 'Matched rules: '+shoppingApproval.policyCheck.matchedRules.map((rule:any)=>rule.name).join(', '):'No additional category-specific spending rules matched this purchase.'}</span></div></div><div className="shopping-flow-actions"><button className="secondary-button" onClick={()=>void declineShoppingPurchase()} disabled={shoppingBusy}>Decline request</button><button className="primary-button" onClick={()=>void approveShoppingPurchase()} disabled={shoppingBusy}>{shoppingBusy?'Checking…':'I approve this purchase'}</button></div><p className="shopping-flow-disclaimer">Approval records your decision only. It does not capture a payment or place an order with the seller.</p></>}
  {shoppingStage==='approved'&&<><div className="shopping-policy-result"><Check size={18}/><div><strong>Approval recorded</strong><span>Your decision is saved. The INR to USD reference-rate quote could not be completed yet.</span></div></div><button className="primary-button" onClick={()=>void approveShoppingPurchase()} disabled={shoppingBusy}>{shoppingBusy?'Loading quote…':'Retry conversion quote'}</button></>}
  {shoppingStage==='checkout'&&shoppingQuote&&<><div className="shopping-conversion"><div><small>APPROVED INR AMOUNT</small><strong>{money(shoppingQuote.sourceAmountINR)}</strong></div><span>→</span><div><small>PAYPAL SANDBOX USD ESTIMATE</small><strong>{new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(shoppingQuote.targetAmountUSD)}</strong></div></div><div className="shopping-rate-details"><span>Reference rate: 1 USD = ₹{Number(shoppingQuote.rateINRPerUSD||0).toFixed(4)}</span><span>Rate date: {shoppingQuote.rateDate}</span><span>Source: {shoppingQuote.provider}</span><span>Quote expires: {new Date(shoppingQuote.expiresAt).toLocaleTimeString()}</span></div><p className="shopping-flow-disclaimer">{shoppingQuote.disclaimer} Shipping, taxes and seller checkout fees are not included. PayPal Sandbox pays the configured PayPilot sandbox merchant; it does not place an order on Amazon or another retailer.</p>{shoppingQuote.status==='accepted'?<><div className="shopping-policy-result"><ShieldCheck size={18}/><div><strong>Conversion accepted — PayPal is ready</strong><span>Complete the sandbox payment using the PayPal button below.</span></div></div><PayPalSandboxButton quoteId={shoppingQuote.id} token={apiToken} onCompleted={onSandboxPaymentCompleted} onError={onSandboxPaymentError}/></>:<button className="primary-button" onClick={()=>void acceptShoppingQuote()} disabled={shoppingBusy}>{shoppingBusy?'Saving…':'Accept conversion & continue to PayPal'}</button>}</>}
  {shoppingStage==='paid'&&shoppingReceipt&&<><div className="shopping-policy-result"><Check size={18}/><div><strong>PayPal Sandbox payment verified</strong><span>PayPal returned a completed capture and PayPilot verified the amount. This is not a retailer order confirmation.</span></div></div><div className="shopping-rate-details"><span>Receipt: {shoppingReceipt.receiptNumber}</span><span>PayPal capture: {shoppingReceipt.paypalCaptureId}</span><span>Captured: {new Date(shoppingReceipt.capturedAt).toLocaleString()}</span></div><div className="shopping-flow-actions"><a className="ai-product-view-link" href={shoppingApproval.productUrl} target="_blank" rel="noreferrer">Continue to seller website <ExternalLink size={13}/></a><button className="secondary-button" onClick={()=>go('Activity')}>View payment activity</button><button className="primary-button" onClick={()=>{setShoppingApproval(null);setShoppingStage('idle');setShoppingQuote(null);setShoppingReceipt(null);}}>Start another search</button></div></>}
</section>}<div className="ai-research-columns"><div><h3>What to prioritize</h3>{aiResearch.result.criteria.map((item,i)=><div className="ai-research-line" key={i}><strong>{item.label}</strong><span>{item.importance}</span></div>)}</div>{aiResearch.result.options.length>0&&<div><h3>Product candidates</h3>{aiResearch.result.options.map((item,i)=><div className="ai-option" key={i}><strong>{item.product}</strong><span>{item.merchant||'Merchant not verified'} · {item.price||'Price not verified'}</span><p>{item.reason}</p><small>{item.verification}</small></div>)}</div>}</div><div className="ai-sources"><strong>Source pages</strong>{aiResearch.sources.map((source,i)=><a key={i} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</div><p className="ai-safety-note">{aiResearch.result.safetyNote}</p></section>}<div className="guest-note"><ShieldCheck size={18}/><span>Guest searches are available without signing in. Sign in only when you want to save your workspace and preferences.</span></div></main></div>;

  return <div className={dark?'app-shell dark':'app-shell'}>
    {mobileOpen&&<button className="mobile-scrim" onClick={()=>setMobileOpen(false)} aria-label="Close menu"/>}
    <aside className={mobileOpen?'sidebar sidebar-open':'sidebar'}>
      <div className="brand"><div className="brand-mark"><PayPilotMark size={22}/></div><span className="brand-name">paypilot<span className="brand-ai">AI</span></span><button className="icon-button sidebar-close" onClick={()=>setMobileOpen(false)}><X size={18}/></button></div>
      <div className="workspace-switch"><div className="workspace-avatar">{(name.trim().split(/\s+/).map(part=>part[0]).join('').slice(0,1)||'P').toUpperCase()}</div><div className="workspace-copy"><strong>{name||'Personal account'}</strong><span>{email||'PayPilot workspace'}</span></div></div>
      <nav className="side-nav">{(['WORKSPACE','MANAGE','PREFERENCES'] as const).map(g=><div className="nav-group" key={g}><p className="nav-heading">{g}</p>{nav.filter(n=>n.group===g).map(n=>{const Icon=n.icon;return <button key={n.label} className={page===n.label?'nav-item active':'nav-item'} onClick={()=>go(n.label)}><Icon size={17}/><span>{n.label}</span>{n.label==='Approvals'&&pendingCount>0&&<span className="nav-count">{pendingCount}</span>}</button>})}</div>)}</nav>
      <div className="sidebar-bottom"><div className="security-note"><div className="security-icon"><LockKeyhole size={15}/></div><div><strong>Your money, your rules.</strong><span>AI never pays without approval.</span></div></div><button className="nav-item help-link" onClick={()=>notify('Help center is coming soon.')}><CircleHelp size={17}/><span>Help center</span></button><div className="profile-row"><div className="profile-avatar">{(name.trim().split(/\\s+/).map(part=>part[0]).join('').slice(0,2)||'PP').toUpperCase()}</div><div className="profile-copy"><strong>{name||'Your account'}</strong><span>{email||'Personal account'}</span></div><button className="icon-button" onClick={()=>go('Settings')} aria-label="Account settings"><MoreHorizontal size={18}/></button></div><button className="nav-item signout-link" onClick={signOutApi}><LogOut size={16}/><span>Sign out</span></button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" onClick={()=>setMobileOpen(true)}><Menu size={20}/></button><div className="breadcrumb">Workspace <span>/</span> <strong>{page}</strong></div></div><div className="topbar-actions"><label className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search transactions..."/></label><button className="icon-button theme-toggle" onClick={()=>setDark(!dark)} aria-label="Toggle theme">{dark?<Sun size={18}/>:<Moon size={18}/>}</button><button className="icon-button notification-button" onClick={()=>notify('You are all caught up.')} aria-label="Notifications"><Bell size={18}/><i/></button><div className="top-avatar">{(name.trim().split(/\\s+/).map(part=>part[0]).join('').slice(0,2)||'PP').toUpperCase()}</div><button className="topbar-signout" onClick={signOutApi} title="Sign out of PayPilot"><LogOut size={15}/><span>Sign out</span></button></div></header>
      <div className="page-content">
      {page==='Overview'&&<><div className="page-heading"><div><div className="eyebrow">{greeting.toUpperCase()} · PURCHASING COMMAND CENTER</div><h1>Shop smarter. Stay in control.</h1><p>Move from a natural-language goal to a purchase you understand and explicitly authorize.</p></div><button className="primary-button" onClick={()=>go('AI Shopping')}><Sparkles size={16}/> Start a purchase plan</button></div>
        <section className="purchase-journey panel"><div className="purchase-journey-head"><div><span className="eyebrow">THE PAYPILOT WORKFLOW</span><h2>One clear path from intent to receipt</h2><p>Your AI plans. Your rules constrain it. You approve. PayPal Sandbox verifies the demo payment.</p></div><span className="journey-protection"><LockKeyhole size={14}/> Human approval required</span></div><div className="purchase-journey-steps"><button className="journey-step" onClick={()=>go('AI Shopping')}><span className="journey-number">01</span><span><strong>Describe</strong><small>Goal, needs & budget</small></span><ArrowUpRight size={15}/></button><span className="journey-connector"/><button className="journey-step" onClick={()=>go('AI Shopping')}><span className="journey-number">02</span><span><strong>Compare</strong><small>Sources & alternatives</small></span><ArrowUpRight size={15}/></button><span className="journey-connector"/><button className="journey-step" onClick={()=>go('Spending rules')}><span className="journey-number">03</span><span><strong>Protect</strong><small>Backend spending limits</small></span><ArrowUpRight size={15}/></button><span className="journey-connector"/><button className="journey-step" onClick={()=>go('Approvals')}><span className="journey-number">04</span><span><strong>Approve</strong><small>{pendingCount?pendingCount+' waiting for you':'You make the decision'}</small></span><ArrowUpRight size={15}/></button><span className="journey-connector"/><button className="journey-step" onClick={()=>go('Approvals')}><span className="journey-number">05</span><span><strong>Pay & verify</strong><small>{tx.some(item=>item.status==='Completed')?'Verified capture recorded':'After approval & conversion quote'}</small></span><ArrowUpRight size={15}/></button></div><div className="journey-foot"><span><i/> Live today: research, saved products, policy checks & human approval</span><span className="journey-coming">Sandbox checkout requires configured PayPal credentials</span></div></section>
        <section className="metric-grid"><article className="metric-card"><div className="metric-top"><span>Captured payments</span><span className="metric-icon blue"><Wallet size={17}/></span></div><div className="metric-value">{money(spentAmount)}</div><div className="metric-foot"><span className="budget-label">Verified PayPal captures</span><span>Verified Sandbox captures</span></div></article><article className="metric-card"><div className="metric-top"><span>Available budget</span><span className="metric-icon green"><ShieldCheck size={17}/></span></div><div className="metric-value">{money(availableBudget)}</div><div className="metric-foot"><span className="budget-label">{budgetUsed.toFixed(1)}% committed</span><span>of {money(monthlyBudget)}</span></div><div className="progress-track"><span style={{width:budgetUsed+'%'}}/></div></article><article className="metric-card"><div className="metric-top"><span>Pending approvals</span><span className="metric-icon orange"><Clock3 size={17}/></span></div><div className="metric-value">{String(pendingCount).padStart(2,'0')}</div><div className="metric-foot"><span className="pending-label">Needs your attention</span><button className="text-action" onClick={()=>go('Approvals')}>Review <ArrowUpRight size={13}/></button></div></article><article className="metric-card"><div className="metric-top"><span>Saved products</span><span className="metric-icon violet"><Sparkles size={17}/></span></div><div className="metric-value">{savedProducts.length}</div><div className="metric-foot"><span className="budget-label">Saved to your account</span></div></article></section>
        <section className="content-grid"><article className="panel spending-panel"><div className="panel-heading"><div><h2>Purchase commitments</h2><p>Human-approved requests reserve budget until checkout is completed or cancelled.</p></div><select className="select-button" value={range} onChange={e=>setRange(e.target.value)}><option>This week</option><option>This month</option><option>Last 30 days</option></select></div><div className="chart-legend"><span className="legend-dot"/> Approved purchase requests <strong>{money(committedAmount)}</strong></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={spendingChart} margin={{top:8,right:4,left:-20,bottom:0}}><defs><linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3978ee" stopOpacity={.18}/><stop offset="100%" stopColor="#3978ee" stopOpacity={.01}/></linearGradient></defs><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--chart-grid)"/><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill:'var(--muted)',fontSize:11}} dy={10}/><YAxis axisLine={false} tickLine={false} tick={{fill:'var(--muted)',fontSize:11}} tickFormatter={v=>'₹'+v}/><Tooltip contentStyle={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:10,fontSize:12}} formatter={(v)=>['₹'+v,'Spent']}/><Area type="monotone" dataKey="amount" stroke="#3978ee" strokeWidth={2.5} fill="url(#spendFill)"/></AreaChart></ResponsiveContainer></div></article>
        <article className="panel permission-panel"><div className="panel-heading"><div><h2>Trust & permission center</h2><p>Hard limits stay outside the AI model</p></div><span className="live-pill"><i/> ACTIVE</span></div><div className="permission-hero"><div className="permission-shield"><ShieldCheck size={22}/></div><div><strong>You’re in control</strong><span>PayPilot follows your rules.</span></div></div><div className="permission-row"><span>All-purchase limit</span><strong>{money(rules.find(r=>r.enabled&&r.category==='all')?.limit||0)}</strong></div><div className="permission-row"><span>Auto-purchase</span><span className="status-off">Disabled</span></div><div className="permission-row"><span>Human approval</span><span className="status-on"><Check size={13}/> Required</span></div><button className="secondary-button full-button" onClick={()=>go('Spending rules')}>Manage spending rules <ArrowUpRight size={14}/></button></article></section>
        <section className="panel transactions-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>A clear view of your latest transactions</p></div><button className="text-action view-all" onClick={()=>go('Activity')}>View all activity <ArrowUpRight size={14}/></button></div>{transactionRows(tx.slice(0,4))}</section><div className="demo-footnote"><ShieldCheck size={14}/> No real payments are processed by PayPilot. Approved requests are not completed transactions.</div></>}
      {page==='AI Shopping'&&<><div className="page-heading"><div><div className="eyebrow">SHOPPING ASSISTANT</div><h1>Tell PayPilot what you want to buy.</h1><p>Get a sourced shortlist, understand the trade-offs, and prepare a purchase without giving the AI payment authority.</p></div><span className="live-pill"><i/> WEB RESEARCH</span></div><section className="ai-search-panel panel"><div className="ai-orb"><Sparkles size={22}/></div><div className="ai-search-content"><h2>What are you looking for?</h2><p>Tell PayPilot what you need. We’ll help you compare before you buy.</p><div className="ai-input-row"><input value={productSearch} onChange={e=>setProductSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void runAiResearch();}} placeholder="e.g. noise cancelling headphones under ₹10,000" aria-label="Describe the product you want to research"/><button className="primary-button" onClick={()=>void runAiResearch()} disabled={aiLoading||!productSearch.trim()}><Sparkles size={15}/>{aiLoading?'Researching…':'Send request'}</button></div><div className="suggestion-chips"><button onClick={()=>void runAiResearch('Laptop for coding under ₹60,000')}>Laptop for coding</button><button onClick={()=>void runAiResearch('Wireless headphones under ₹5,000')}>Wireless headphones</button><button onClick={()=>void runAiResearch('Ergonomic keyboard')}>Ergonomic keyboard</button></div></div></section><section className="shopping-chat panel" aria-live="polite"><div className="shopping-chat-heading"><div><span className="shopping-chat-avatar"><Sparkles size={15}/></span><div><strong>PayPilot assistant</strong><small>Research chat · seller-backed results</small></div></div><span className="chat-status"><i/> Ready</span></div><div className="shopping-chat-messages">{shoppingChat.map(turn=><div className={'shopping-chat-row '+turn.role} key={turn.id}><div className="shopping-chat-bubble"><p>{turn.text}</p><time>{turn.time}</time></div></div>)}{aiLoading&&<div className="shopping-chat-row assistant"><div className="shopping-chat-bubble chat-thinking"><span/><span/><span/> Researching seller pages and checking available details…</div></div>}</div></section>{aiResearch&&<section className="panel ai-research-results"><div className="panel-heading"><div><h2>{aiResearch.provider?.includes('fallback')?'Shopping research':'AI research brief'}</h2><p>{aiResearch.provider || 'Web research'}</p></div><button className="text-action" onClick={()=>setAiResearch(null)}>Dismiss</button></div><p className="ai-research-summary">{aiResearch.result.summary}</p>{aiResearch.products&&aiResearch.products.length>0?<> <div className="ai-visual-products"><div className="ai-products-heading"><div><h3>Products found on shopping sites</h3><p>Seller-page details where accessible. Open a listing to confirm the current offer.</p></div><span>{aiResearch.products.length} results</span></div><div className="ai-product-grid">{aiResearch.products.map(item=><article className="ai-product-card" key={item.url}><a className="ai-product-image" href={item.url} target="_blank" rel="noreferrer"><ProductImage src={item.image} title={item.title}/></a><div className="ai-product-card-body"><span className="ai-product-merchant">{item.merchant}</span><h4>{item.title}</h4>{item.price?<strong className="ai-product-price">{item.price}</strong>:<span className="ai-price-unavailable">Price not verified</span>}{item.description&&<p>{item.description}</p>}<button className="text-action save-product-action" onClick={()=>void saveProduct(item)} disabled={savedProducts.some(saved=>saved.url===item.url)}>{savedProducts.some(saved=>saved.url===item.url)?<><Check size={13}/> Saved</>:<><Bookmark size={13}/> Save product</>}</button>{item.selectionToken?<button className="text-action request-approval-action" onClick={()=>void requestApprovalForProduct(item)} disabled={shoppingBusy||shoppingStage==='protect'||shoppingStage==='approved'||shoppingStage==='checkout'}>{shoppingBusy?'Preparing…':'Choose & protect purchase'}</button>:item.price?<span className="ai-price-unavailable">Purchase request needs a verified INR seller price</span>:null}<a className="ai-product-view-link" href={item.url} target="_blank" rel="noreferrer">View on seller website <ExternalLink size={13}/></a></div></article>)}</div></div><ProductComparison products={aiResearch.products} budget={budgetFromQuery(productSearch,Number(budget))}/></>:<div className="ai-no-products"><strong>No verified individual product listings found</strong><span>PayPilot has filtered out category pages and buying guides rather than showing them as products. Try searching for a specific laptop model or a retailer product page.</span></div>}<div className="ai-research-columns"><div><h3>What to prioritize</h3>{aiResearch.result.criteria.map((item,i)=><div className="ai-research-line" key={i}><strong>{item.label}</strong><span>{item.importance}</span></div>)}</div>{aiResearch.result.options.length>0&&<div><h3>Product candidates</h3>{aiResearch.result.options.map((item,i)=><div className="ai-option" key={i}><strong>{item.product}</strong><span>{item.merchant||'Merchant not verified'} · {item.price||'Price not verified'}</span><p>{item.reason}</p><small>{item.verification}</small></div>)}</div>}{aiResearch.result.rejectedAlternatives&&aiResearch.result.rejectedAlternatives.length>0&&<div className="ai-research-rejected"><h3>Why other options were not selected</h3>{aiResearch.result.rejectedAlternatives.map((option,i)=><div key={i}><strong>{option.product}</strong><span>{option.reason}</span></div>)}</div>}</div>{aiResearch.result.questions.length>0&&<div className="ai-research-questions"><strong>Questions to refine your search</strong>{aiResearch.result.questions.map((q,i)=><span key={i}>• {q}</span>)}</div>}<p className="ai-safety-note">{aiResearch.result.safetyNote}</p><div className="ai-sources"><strong>Sources</strong>{aiResearch.sources.map((source,i)=><a key={i} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</div><small className="ai-safety-note">{aiResearch.note}</small></section>}{apiError&&<div className="api-error">{apiError}</div>}<div className="safety-banner"><ShieldCheck size={18}/><div><strong>You stay in control</strong><span>PayPilot can research and prepare a purchase. Only you can authorize a payment.</span></div></div></>}
      {page==='Saved products'&&<><div className="page-heading"><div><div className="eyebrow">YOUR SHORTLIST</div><h1>Saved products</h1><p>Products you've kept for later comparison.</p></div><span className="live-pill"><i/> {savedProducts.length} SAVED</span></div><section className="ai-visual-products"><div className="ai-product-grid">{savedProducts.map(item=><article className="ai-product-card" key={item.id}><a className="ai-product-image" href={item.url} target="_blank" rel="noreferrer"><ProductImage src={item.image} title={item.title}/></a><div className="ai-product-card-body"><span className="ai-product-merchant">{item.merchant}</span><h4>{item.title}</h4>{item.price?<strong className="ai-product-price">{item.price}</strong>:<span className="ai-price-unavailable">Price not verified</span>}{item.description&&<p>{item.description}</p>}<div className="saved-product-actions"><a className="ai-product-view-link" href={item.url} target="_blank" rel="noreferrer">View seller page <ExternalLink size={13}/></a><button className="text-action" onClick={()=>{go('AI Shopping');void runAiResearch(item.title);}} disabled={aiLoading}>Find current offer</button><button className="text-action" onClick={()=>void removeSavedProduct(item.id)}>Remove</button></div></div></article>)}</div>{savedProducts.length===0&&<div className="empty-state"><Bookmark size={25}/><strong>No saved products yet</strong><span>Run an AI shopping search and save products to compare them later.</span><button className="secondary-button" onClick={()=>go('AI Shopping')}>Explore products</button></div>}</section></>}
      {page==='Approvals'&&<><div className="page-heading"><div><div className="eyebrow">HUMAN-IN-THE-LOOP PAYMENTS</div><h1>Your decision is the final gate.</h1><p>Review the exact item, merchant, amount and policy checks before any sandbox payment step.</p></div><span className="live-pill"><i/> {pendingCount} NEEDS REVIEW</span></div>{apiError&&<div className="api-error">{apiError}</div>}<div className="approval-summary"><div className="approval-stat"><span>Waiting for you</span><strong>{pendingCount}</strong></div><div className="approval-stat"><span>Approved this month</span><strong>{requests.filter(a=>a.status==='approved').length}</strong></div><div className="approval-stat"><span>Declined this month</span><strong>{requests.filter(a=>a.status==='declined').length}</strong></div></div><section className="panel approvals-panel"><div className="panel-heading"><div><h2>Purchase requests</h2><p>AI-prepared purchases that need your decision</p></div><span className="status-badge pending"><i/> Action required</span></div>{requests.filter(a=>a.status==='pending').map(a=><div className="approval-item" key={a.id}><div className={'merchant-logo '+a.tone}>{a.icon}</div><div className="approval-item-copy"><strong>{a.name}</strong><span>{a.detail}</span><small>Requested just now · {a.kind}</small></div><div className="approval-item-price">{money(a.amount)}<span>INR purchase amount</span></div><button className="secondary-button" onClick={()=>setModal({type:'approval',id:a.id})}>Review request</button></div>)}{requests.filter(a=>a.status==='approved').map(a=>{const payment=tx.find(t=>t.approvalId===a.id);return <div className="approval-item" key={a.id}><div className="merchant-logo green">{a.icon}</div><div className="approval-item-copy"><strong>{a.name}</strong><span>{a.detail}</span><small>{payment?.status==='Completed'?'Sandbox payment completed':payment?.status==='Pending'?'Payment pending':payment?.status==='Failed'?'Payment failed · review required':'Approved · No payment captured'}</small></div><div className="approval-item-price">{money(a.amount)}<span>INR purchase amount</span></div>{payment?.status==='Completed'?<span className="status-badge complete"><i/>Paid</span>:payment?.status==='Pending'?<span className="status-badge pending"><i/>Pending</span>:payment?.status==='Failed'?<span className="status-badge failed"><i/>Failed</span>:<button className="secondary-button" onClick={()=>void openFxQuote(a.id)}>Get conversion estimate</button>}</div>})}{pendingCount===0&&requests.filter(a=>a.status==='approved').length===0&&<div className="empty-state"><ShieldCheck size={25}/><strong>All caught up</strong><span>There are no purchase requests waiting for your review.</span></div>}</section><div className="safety-banner"><LockKeyhole size={18}/><div><strong>Approval is always yours</strong><span>This records your approval decision only. It does not initiate or capture a payment.</span></div></div></>}
      {page==='Activity'&&<><div className="page-heading"><div><div className="eyebrow">ACCOUNT HISTORY & DECISION RECORD</div><h1>Activity & audit trail</h1><p>See what PayPilot recommended, what you authorized and what actually happened.</p></div></div><section className="panel transactions-panel"><div className="activity-toolbar"><div><h2>Purchase and payment records</h2><p>{filteredTx.length} records in your account</p></div><div className="filter-controls"><select className="select-button" value={filter} onChange={e=>setFilter(e.target.value)}><option>All</option><option>Completed</option><option>Pending</option><option>Approved</option><option>Declined</option><option>Failed</option></select><button className="select-button" onClick={()=>{setQuery('');setFilter('All')}}><RefreshCw size={13}/> Reset</button></div></div>{transactionRows(filteredTx)}</section><section className="panel audit-panel"><div className="panel-heading"><div><h2>Decision trail</h2><p>Append-only records of purchase requests and your decisions.</p></div><span className="live-pill"><i/> {auditEvents.length} EVENTS</span></div>{auditEvents.length? <div className="audit-list">{auditEvents.map(event=><article className="audit-event" key={event._id}><span className={'audit-event-marker '+(event.action==='purchase.approved'?'approved':event.action==='purchase.declined'?'declined':'requested')}>{event.action==='purchase.approved'?<Check size={14}/>:event.action==='purchase.declined'?<X size={14}/>:<Activity size={14}/>}</span><div className="audit-event-copy"><strong>{event.action==='purchase.requested'?'Purchase request created':event.action==='purchase.approved'?'You approved a purchase':event.action==='purchase.declined'?'You declined a purchase':event.action}</strong><span>{event.details?.product||event.details?.item||'Purchase record'}{event.details?.merchant?' · '+event.details.merchant:''}</span><small>{new Date(event.createdAt).toLocaleString()} · {event.action==='payment.captured'||event.details?.paymentCaptured?'Payment captured':'No payment captured'}</small>{event.details?.recommendationReason&&<p>{event.details.recommendationReason}</p>}{Array.isArray(event.details?.rejectedAlternatives)&&event.details.rejectedAlternatives.length>0&&<div className="audit-rejected"><b>Alternatives rejected by AI</b>{event.details.rejectedAlternatives.map((option:any,i:number)=><span key={i}>{option.product}: {option.reason}</span>)}</div>}</div><strong className="audit-amount">{typeof event.details?.amount==='number'?money(event.details.amount):''}</strong></article>)}</div>:<div className="empty-state"><Activity size={24}/><strong>No decisions recorded yet</strong><span>Your purchase requests, approval decisions and future payment events will appear here.</span></div>}</section></>}
      {page==='Spending rules'&&<><div className="page-heading"><div><div className="eyebrow">YOUR PERMISSION ENGINE</div><h1>Spending rules</h1><p>Set boundaries for what your AI assistant can prepare.</p></div><button className="primary-button" onClick={()=>setModal({type:'rule'})}><Plus size={16}/> Create a rule</button></div><div className="rules-intro panel"><div className="rules-intro-icon"><ShieldCheck size={22}/></div><div><strong>Guardrails before checkout</strong><span>Rules are checked before any purchase request reaches your approval queue. Auto-purchase is off by default.</span></div><span className="live-pill"><i/> PROTECTED</span></div><div className="rules-list">{rules.map(r=><article className="rule-card panel" key={r.id}><div className="rule-main"><div className="rule-icon"><SlidersHorizontal size={18}/></div><div className="rule-copy"><strong>{r.name}</strong><span>{r.description}</span></div><span className={r.enabled?'rule-state enabled':'rule-state'}>{r.enabled?'Active':'Paused'}</span><button className={r.enabled?'toggle-switch on':'toggle-switch'} onClick={()=>void toggleRule(r.id)} aria-label={'Toggle '+r.name}><i/></button><button className="rule-delete-button" onClick={()=>void deleteRule(r.id)} aria-label={'Delete '+r.name}><Trash2 size={14}/></button></div><div className="rule-usage"><div><span>Used {money(r.spent)} of {money(r.limit)}</span><strong>{r.limit?Math.round(r.spent/r.limit*100):0}%</strong></div><div className="progress-track"><span style={{width:Math.min(100,r.limit?r.spent/r.limit*100:0)+'%'}}/></div></div></article>)}</div><p className="demo-footnote"><LockKeyhole size={14}/> These rules are saved to your account and checked before purchase requests. PayPilot does not process payments.</p></>}
      {page==='Integrations'&&<><div className="page-heading"><div><div className="eyebrow">CONNECTED SERVICES</div><h1>Integrations</h1><p>Connect the tools you use to shop and pay.</p></div><span className="live-pill"><i/> {connected.length} CONNECTED</span></div><section className="integration-banner panel"><div className="integration-banner-icon"><Link2 size={21}/></div><div><strong>Your accounts, connected on your terms.</strong><span>Secure third-party connections are not enabled yet. No credentials or payment permissions are requested.</span></div></section><div className="integration-grid">{[{name:'PayPal',desc:'Payment account and checkout',letter:'P',tone:'paypal'},{name:'Amazon',desc:'Shopping and product discovery',letter:'a',tone:'amazon'},{name:'Google',desc:'Identity and productivity',letter:'G',tone:'google'},{name:'Shopify',desc:'Store and order information',letter:'S',tone:'shopify'}].map(x=><article className="integration-card panel" key={x.name}><div className={'integration-logo '+x.tone}>{x.letter}</div><div className="integration-copy"><strong>{x.name}</strong><span>{x.desc}</span></div>{connected.includes(x.name)?<button className="connected-button" onClick={()=>notify('This integration is not available yet.')}><Check size={13}/> Connected</button>:<button className="secondary-button" disabled title="This integration is not available yet">Coming soon</button>}</article>)}</div><div className="safety-banner"><ShieldCheck size={18}/><div><strong>Least-privilege by design</strong><span>Future integrations will request only the access required for their feature.</span></div></div></>}
      {page==='Settings'&&<><div className="page-heading"><div><div className="eyebrow">ACCOUNT PREFERENCES</div><h1>Settings</h1><p>Manage your profile, budget and security preferences.</p></div><button className="primary-button" onClick={saveSettings}><Check size={15}/> Save changes</button></div><div className="settings-layout"><div className="settings-nav panel"><button className="settings-tab active"><Settings size={15}/> General</button><button className="settings-tab" onClick={()=>document.getElementById('settings-security')?.scrollIntoView({behavior:'smooth',block:'start'})}><LockKeyhole size={15}/> Security</button><button className="settings-tab" onClick={()=>notify('Email and push notifications are not enabled yet.')}><Bell size={15}/> Notifications</button></div><div className="settings-content panel"><div className="settings-section"><h2>Personal information</h2><p>Update the details associated with your PayPilot profile.</p><label className="field-label">Full name<input value={name} onChange={e=>setName(e.target.value)}/></label><label className="field-label">Email address<input value={email} readOnly/><small>Email changes are unavailable until account verification is supported.</small></label></div><div className="settings-section"><h2>Account</h2><p>Your account is used for your saved preferences and dashboard.</p>{apiToken?<div className="settings-security"><div><strong>Signed in</strong><span>{email}</span></div><button className="secondary-button" onClick={signOutApi}>Sign out</button></div>:<button className="primary-button" onClick={()=>{setAuthMode('login');setSiteView('auth');}}>Sign in or create account</button>}</div><div className="settings-section"><h2>Budget preferences</h2><p>Your monthly budget helps PayPilot make more relevant recommendations.</p><label className="field-label">Monthly spending budget (INR)<input type="number" min="1" value={budget} onChange={e=>setBudget(e.target.value)}/></label></div><div className="settings-section" id="settings-security"><h2>Security & permissions</h2><div className="settings-security"><div><strong>Human approval required</strong><span>Every payment needs your explicit confirmation.</span></div><span className="status-on"><Check size={13}/> Always on</span></div><div className="settings-security"><div><strong>Auto-purchase</strong><span>PayPilot cannot complete purchases automatically.</span></div><span className="status-off">Disabled</span></div><h3 className="settings-subheading">Change password</h3><p>Your current password is required to make this change. Google-only accounts manage their password through Google.</p><label className="field-label">Current password<input type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></label><label className="field-label">New password<input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="At least 8 characters"/></label><button className="secondary-button" onClick={()=>void changePassword()} disabled={passwordLoading||!currentPassword||newPassword.length<8}>{passwordLoading?'Updating…':'Update password'}</button></div><button className="primary-button" onClick={saveSettings}><Check size={15}/> Save preferences</button></div></div></>}
      </div>
    </main>
    {modal&&<div className="modal-backdrop" onClick={()=>setModal(null)}><div className="approval-modal" onClick={e=>e.stopPropagation()}><button className="modal-close icon-button" onClick={()=>setModal(null)}><X size={18}/></button>
      {modal.type==='approval'&&<><div className="modal-icon"><ShieldCheck size={22}/></div><div className="eyebrow">PAYMENT APPROVAL</div><h2>{activeApproval?.name || 'Purchase request'}</h2><p className="modal-subtitle">PayPilot has prepared this purchase. Review the details before deciding.</p><div className="approval-amount">{money(activeApproval?.amount || 0)}</div><div className="modal-detail"><span>Merchant</span><strong>{activeApproval?.merchant || 'Merchant'}</strong></div><div className="modal-detail"><span>Payment method</span><strong>No payment method connected</strong></div><div className="modal-detail"><span>Permission check</span><span className="status-on"><Check size={13}/> {activeApproval?.policyCheck?.withinMonthlyBudget===false?'Needs review':'Within saved rules'}</span></div>{activeApproval?.userGoal&&<div className="approval-context"><strong>Original goal</strong><span>{activeApproval.userGoal}</span></div>}{activeApproval?.recommendationReason&&<div className="approval-context"><strong>Why PayPilot selected this</strong><span>{activeApproval.recommendationReason}</span></div>}{activeApproval?.rejectedAlternatives?.length>0&&<div className="approval-context"><strong>Alternatives not selected</strong>{activeApproval.rejectedAlternatives.map((option:any,i:number)=><span key={i}>{option.product}: {option.reason}</span>)}</div>}{activeApproval?.productUrl&&<a className="approval-source-link" href={activeApproval.productUrl} target="_blank" rel="noreferrer">Review seller listing <ExternalLink size={13}/></a>}<div className="modal-warning"><LockKeyhole size={15}/> Approval records your decision only. It does not initiate or capture a payment.</div><div className="modal-actions"><button className="secondary-button" onClick={()=>void decline(String(modal.id||''))}>Decline</button><button className="primary-button" onClick={()=>void approve(String(modal.id||''))}>Approve request</button></div></>}
      {modal.type==='fxQuote'&&<><div className="modal-icon"><CreditCard size={22}/></div><div className="eyebrow">INR TO USD CONVERSION</div><h2>Review the exchange-rate estimate</h2><p className="modal-subtitle">Your purchase request is approved. Review the converted amount before the PayPal Sandbox checkout.</p><div className="fx-quote-amount"><span>{money(fxQuote?.sourceAmountINR||0)}</span><b>→</b><strong>{new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(fxQuote?.targetAmountUSD||0)}</strong></div><div className="modal-detail"><span>Rate</span><strong>1 USD = ₹{Number(fxQuote?.rateINRPerUSD||0).toFixed(4)}</strong></div><div className="modal-detail"><span>Equivalent rate</span><strong>₹1 = ${Number(fxQuote?.rateUSDPerINR||0).toFixed(6)}</strong></div><div className="modal-detail"><span>Rate source</span><strong>European Central Bank reference rate</strong></div><div className="modal-detail"><span>Rate date</span><strong>{fxQuote?.rateDate||'—'}</strong></div><div className="modal-detail"><span>Review window ends</span><strong>{fxQuote?.expiresAt?new Date(fxQuote.expiresAt).toLocaleTimeString(): '—'}</strong></div><div className="modal-warning"><ShieldCheck size={15}/> This is an ECB reference-rate estimate, not a locked PayPal rate or a guarantee of your bank's final charge. It uses the seller's listed price only; shipping, taxes and retailer checkout fees are not included. Sandbox checkout simulates a payment to your PayPilot merchant account, not an order with the external retailer.</div>{apiError&&<div className="api-error">{apiError}</div>}{fxQuote?.status==='accepted'?<><PayPalSandboxButton quoteId={fxQuote.id} token={apiToken} onCompleted={onSandboxPaymentCompleted} onError={onSandboxPaymentError}/><div className="modal-actions"><button className="secondary-button" onClick={()=>setModal(null)}>Close</button></div></>:<div className="modal-actions"><button className="secondary-button" onClick={()=>setModal(null)}>Review later</button><button className="primary-button" onClick={()=>void acceptFxQuote()}>Accept conversion estimate</button></div>}</>}{modal.type==='receipt'&&<><div className="modal-icon"><Check size={22}/></div><div className="eyebrow">SANDBOX PAYMENT VERIFIED</div><h2>Payment receipt</h2><p className="modal-subtitle">PayPal returned a completed capture and the server verified its USD amount.</p><div className="approval-amount">{receipt?.receiptNumber||'—'}</div><div className="modal-detail"><span>Item</span><strong>{receipt?.item||'—'}</strong></div><div className="modal-detail"><span>INR purchase value</span><strong>{receipt?money(receipt.amountINR):'—'}</strong></div><div className="modal-detail"><span>Captured USD</span><strong>{receipt?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(receipt.amountUSD):'—'}</strong></div><div className="modal-detail"><span>PayPal capture ID</span><strong>{receipt?.paypalCaptureId||'—'}</strong></div><div className="modal-detail"><span>Captured at</span><strong>{receipt?.capturedAt?new Date(receipt.capturedAt).toLocaleString():'—'}</strong></div><div className="modal-warning"><ShieldCheck size={15}/> {receipt?.note}</div><div className="modal-actions"><button className="primary-button" onClick={()=>{setModal(null);go('Activity');}}>View activity</button></div></>}{modal.type==='transaction'&&<><div className="modal-icon"><Activity size={22}/></div><div className="eyebrow">ACCOUNT ACTIVITY</div><h2>{activeTransaction?.name||'Transaction details'}</h2><p className="modal-subtitle">{activeTransaction?.detail||'Activity record from your PayPilot account.'}</p><div className="approval-amount">{money(activeTransaction?.amount||0)}</div><div className="modal-detail"><span>Category</span><strong>{activeTransaction?.category||'—'}</strong></div><div className="modal-detail"><span>Date</span><strong>{activeTransaction?new Date(activeTransaction.date).toLocaleString():'—'}</strong></div><div className="modal-detail"><span>Status</span><strong>{activeTransaction?.status||'—'}</strong></div><div className="modal-warning"><ShieldCheck size={15}/> {activeTransaction?.status==='Completed'?'This transaction has a verified PayPal Sandbox capture. It does not place an order with the external retailer.':'An approved request is not a completed payment. PayPilot does not process transactions.'}</div><div className="modal-actions"><button className="primary-button" onClick={()=>setModal(null)}>Close</button></div></>}
      {modal.type==='rule'&&<><div className="modal-icon"><SlidersHorizontal size={22}/></div><div className="eyebrow">CUSTOM PERMISSION</div><h2>Create a spending rule</h2><p className="modal-subtitle">Define a boundary for your AI shopping assistant.</p><label className="field-label">Rule name<input value={newRule.name} onChange={e=>setNewRule(v=>({...v,name:e.target.value}))} placeholder="e.g. Electronics purchases"/></label><label className="field-label">Description<input value={newRule.description} onChange={e=>setNewRule(v=>({...v,description:e.target.value}))} placeholder="What does this rule cover?"/></label><label className="field-label">Category<select value={newRule.category} onChange={e=>setNewRule(v=>({...v,category:e.target.value}))}><option value="all">All purchases</option><option value="shopping">Shopping</option><option value="Electronics">Electronics</option><option value="Software">Software</option><option value="Books & learning">Books & learning</option><option value="Travel">Travel</option></select></label><label className="field-label">Spending limit (INR)<input type="number" value={newRule.limit} onChange={e=>setNewRule(v=>({...v,limit:e.target.value}))}/></label><div className="modal-actions"><button className="secondary-button" onClick={()=>setModal(null)}>Cancel</button><button className="primary-button" onClick={()=>void addRule()}>Create rule</button></div></>}
    </div></div>}
    {notice&&<div className="toast"><Check size={16}/>{notice}</div>}
  </div>;
};
export default App;
