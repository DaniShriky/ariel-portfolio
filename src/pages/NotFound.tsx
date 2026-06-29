import { Link } from 'react-router-dom';

function NotFound() {
  return (
    <div>
      <h1>Page not found</h1>
      <p>The page you're looking for doesn't exist.</p>
      <Link to="/">Back to home</Link>
    </div>
  );
}

export default NotFound;
