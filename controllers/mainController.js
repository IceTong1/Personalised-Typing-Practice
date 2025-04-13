// Controller for general pages

// Render the manual page
exports.getManual = (req, res) => {
    res.render('manual', {
        title: 'Manual',
        user: req.session.user, // Pass user session if needed for header/footer
    });
};
