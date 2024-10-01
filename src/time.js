window.onload = function() {
    setInterval(function(){
        var date = new Date();
        var displayTime = date.toLocaleTimeString(
            'en-US', {
                timeZone: 'Europe/Brussels'
            });
        document.getElementById('datetime').innerHTML = displayTime;
    }, 1000);
}