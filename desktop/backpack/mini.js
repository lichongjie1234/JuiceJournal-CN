(function(){
 const button=document.getElementById('enterMini');let action;
 window.MiniPanel={init(options){action=options.action;button.onclick=async()=>{await options.flush();await action('miniMode',true);};},render(s){button.textContent=s.settings.floatingVisible?'显示小窗':'打开小窗';},sync(){}};
})();
