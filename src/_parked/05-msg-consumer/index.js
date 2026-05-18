
function setup(context) {
    const { container } = context;
    const btnConsume = container.querySelector('#btn-consume');
    let isConsuming = false;

    btnConsume.addEventListener('click', () => {
        isConsuming = !isConsuming;

        if (isConsuming) {
            btnConsume.textContent = 'Stop Consumption';
            btnConsume.classList.remove('btn-primary');
            btnConsume.classList.add('btn-danger');

            // Here we would start the Solace consumer flow
        } else {
            btnConsume.textContent = 'Start Consumption';
            btnConsume.classList.remove('btn-danger');
            btnConsume.classList.add('btn-primary');
        }
    });
}
