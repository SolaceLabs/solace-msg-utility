
function setup(context) {
    const { container } = context;
    const btnPublish = container.querySelector('#btn-publish');

    btnPublish.addEventListener('click', () => {
        // #MOCK_BEG
        // Mock Publish
        btnPublish.disabled = true;
        btnPublish.textContent = 'Publishing...';

        setTimeout(() => {
            btnPublish.disabled = false;
            btnPublish.textContent = 'Publish Message';
            alert('Message published! (Mock)');
        }, 500);
        // #MOCK_END
    });
}
